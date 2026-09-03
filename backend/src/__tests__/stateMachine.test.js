// src/__tests__/stateMachine.test.js
//
// Runs against a real MongoDB. With MONGODB_URI unset, src/db.js starts
// a real mongod as a single-node replica set in a temp directory, so
// the suite needs no server and no container — but it is the same
// engine, the same query language and the same driver-facing code path
// as production. Set MONGODB_URI to run this identical suite against a
// real deployment:
//
//   MONGODB_URI=mongodb+srv://... MONGODB_DB=tfs_test npm run test:atlas
//
// The suite empties every collection between tests, so the database
// name has to end in `_test` — helpers/reset.js refuses otherwise.
//
// Every call is awaited because the database layer is async — a network
// round-trip cannot be made to look synchronous.

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const sm = require('../lib/stateMachine');
const { resetDb, assetDoc, siteDoc } = require('./helpers/reset');

async function seedMinimal() {
  await resetDb();
  await db.sites.insertMany([
    siteDoc('JHB-DC1', 'JHB-DC1', 'DC'),
    siteDoc('Alberton (ALB)', 'Alberton', 'Hub'),
    siteDoc('CPT-DC1', 'CPT-DC1', 'DC'),
  ]);
  await db.assets.insertMany(['RT-100001', 'RT-100002', 'RT-100003'].map((id) => assetDoc(id)));
}

test.after(() => db.close());

test('TP1: opening a dispatch creates a manifest and moves scanned assets to In Dispatch', async () => {
  await seedMinimal();
  const { manifestId } = await sm.tp1DispatchOpen('JHB-DC1', 'T. Nkosi', ['RT-100001', 'RT-100002']);
  const a1 = await sm.getAsset('RT-100001');
  assert.equal(a1.status, 'In Dispatch');
  assert.equal(a1.manifest_id, manifestId);
  const manifest = await sm.getManifest(manifestId);
  assert.equal(manifest.stage, 1);
  assert.equal(manifest.kind, 'dispatch');
});

test('TP1: rejects an asset that is not available at the claimed site', async () => {
  await seedMinimal();
  await db.assets.updateOne({ _id: 'RT-100001' }, { $set: { home_site_code: 'CPT-DC1' } });
  await assert.rejects(() => sm.tp1DispatchOpen('JHB-DC1', 'T. Nkosi', ['RT-100001']), /not available/);
});

test('TP1: a rejected asset rolls the whole manifest back rather than leaving a half-open one', async () => {
  // Worth asserting explicitly: a write issued through the module-level
  // `db` rather than the transaction's `tx` would commit on its own and
  // survive this rollback.
  await seedMinimal();
  await db.assets.updateOne({ _id: 'RT-100002' }, { $set: { home_site_code: 'CPT-DC1' } });
  await assert.rejects(
    () => sm.tp1DispatchOpen('JHB-DC1', 'Op', ['RT-100001', 'RT-100002']),
    /not available/
  );
  assert.equal(await db.manifests.countDocuments({}), 0, 'no manifest should survive the failed open');
  assert.equal(await db.custodyLog.countDocuments({}), 0, 'no custody entry should survive either');
  const a1 = await sm.getAsset('RT-100001');
  assert.equal(a1.status, 'Available at DC', 'the asset that did validate must not be left In Dispatch');
});

test('TP2: a missing asset is flagged Outstanding and logs a Missed Scan exception, but the manifest still closes', async () => {
  await seedMinimal();
  const { manifestId } = await sm.tp1DispatchOpen('JHB-DC1', 'T. Nkosi', ['RT-100001', 'RT-100002']);
  const result = await sm.tp2DispatchClose(manifestId, 'Alberton (ALB)', ['RT-100001'], 'T. Nkosi');
  assert.deepEqual(result.missing, ['RT-100002']);

  const a1 = await sm.getAsset('RT-100001');
  assert.equal(a1.status, 'Dispatched — In Transit');
  const a2 = await sm.getAsset('RT-100002');
  assert.equal(a2.outstanding_reason, 'Missing at Dispatch Close');

  const manifest = await sm.getManifest(manifestId);
  assert.equal(manifest.stage, 2, 'manifest closes even with a missing asset');

  const exceptions = await db.exceptions.find({ asset_id: 'RT-100002' });
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].type, 'Missed Scan');
});

test('full loop: TP1 → TP2 → TP3 → TP4 → TP5 → TP6 → TP7 returns the asset to Available at DC', async () => {
  await seedMinimal();
  const { manifestId } = await sm.tp1DispatchOpen('JHB-DC1', 'Op', ['RT-100001']);
  await sm.tp2DispatchClose(manifestId, 'Alberton (ALB)', ['RT-100001'], 'Op');
  await sm.tp3TdtIntake(manifestId, ['RT-100001'], 'Driver');
  const { ePodId } = await sm.tp4TdtLoaded(manifestId, {}, 'Driver');
  assert.ok(ePodId.startsWith('ePOD-'));
  await sm.tp5HubIntake(manifestId, 'Alberton (ALB)', ['RT-100001'], 'HubOp');
  assert.equal((await sm.getAsset('RT-100001')).status, 'At Hub: Alberton (ALB)');

  const { returnManifestId } = await sm.tp6HubEmptyCollection('Alberton (ALB)', ['RT-100001'], 'HubOp');
  assert.equal((await sm.getAsset('RT-100001')).status, 'Ready for Return — Awaiting Collection');

  await sm.tp7ReturnReceipt(returnManifestId, 'JHB-DC1', ['RT-100001'], 'Op', false);
  const final = await sm.getAsset('RT-100001');
  assert.equal(final.status, 'Available at DC');
  assert.equal(final.home_site_code, 'JHB-DC1');

  const custody = await db.custodyLog.find({ asset_id: 'RT-100001' }, { sort: { ts: 1 } });
  assert.equal(custody.length, 7, 'one custody entry per touch point');
});

test('TP4 blocks confirmation until every missing asset has a reason code', async () => {
  await seedMinimal();
  const { manifestId } = await sm.tp1DispatchOpen('JHB-DC1', 'Op', ['RT-100001', 'RT-100002']);
  await sm.tp2DispatchClose(manifestId, 'Alberton (ALB)', ['RT-100001', 'RT-100002'], 'Op');
  await sm.tp3TdtIntake(manifestId, ['RT-100001'], 'Driver'); // RT-100002 not scanned -> outstanding
  await assert.rejects(() => sm.tp4TdtLoaded(manifestId, {}, 'Driver'), /reason code/);
  const { ePodId } = await sm.tp4TdtLoaded(manifestId, { 'RT-100002': 'Left behind' }, 'Driver');
  assert.ok(ePodId);
  assert.equal((await sm.getAsset('RT-100002')).outstanding_reason, 'Not loaded — Left behind');
});

test('TP6 raises an Aged at Hub exception for stock left behind for a week or more', async () => {
  await seedMinimal();
  const m1 = await sm.tp1DispatchOpen('JHB-DC1', 'Op', ['RT-100001', 'RT-100002']);
  await sm.tp2DispatchClose(m1.manifestId, 'Alberton (ALB)', ['RT-100001', 'RT-100002'], 'Op');
  await sm.tp3TdtIntake(m1.manifestId, ['RT-100001', 'RT-100002'], 'Driver');
  await sm.tp4TdtLoaded(m1.manifestId, {}, 'Driver');
  await sm.tp5HubIntake(m1.manifestId, 'Alberton (ALB)', ['RT-100001', 'RT-100002'], 'HubOp');

  // RT-100002 has been sitting there for nine days and does not get
  // collected on this run.
  await db.assets.updateOne(
    { _id: 'RT-100002' },
    { $set: { hub_arrival_at: new Date(Date.now() - 9 * 86400000) } }
  );

  await sm.tp6HubEmptyCollection('Alberton (ALB)', ['RT-100001'], 'HubOp');
  const aged = await db.exceptions.find({ type: 'Aged at Hub' });
  assert.equal(aged.length, 1);
  assert.equal(aged[0].asset_id, 'RT-100002');
  assert.match(aged[0].note, /9 days/);
});

test('TP7 Returns Facility Routing sets status to Available at Returns Facility', async () => {
  await seedMinimal();
  await db.sites.insertOne(siteDoc('Returns Facility — Isando', 'Isando', 'Returns'));
  const { manifestId } = await sm.tp1DispatchOpen('JHB-DC1', 'Op', ['RT-100001']);
  await sm.tp2DispatchClose(manifestId, 'Alberton (ALB)', ['RT-100001'], 'Op');
  await sm.tp3TdtIntake(manifestId, ['RT-100001'], 'Driver');
  await sm.tp4TdtLoaded(manifestId, {}, 'Driver');
  await sm.tp5HubIntake(manifestId, 'Alberton (ALB)', ['RT-100001'], 'HubOp');
  const { returnManifestId } = await sm.tp6HubEmptyCollection('Alberton (ALB)', ['RT-100001'], 'HubOp');
  await sm.tp7ReturnReceipt(returnManifestId, 'Returns Facility — Isando', ['RT-100001'], 'Op', true);
  assert.equal((await sm.getAsset('RT-100001')).status, 'Available at Returns Facility');
});

test('WSW: intake accepts a misrouted asset regardless of prior status, sort releases it to active stock', async () => {
  await seedMinimal();
  await sm.wsw1Intake('CPT-DC1', 'RT-100001', 'WSW Op');
  assert.equal((await sm.getAsset('RT-100001')).status, 'At WSW: CPT-DC1');
  await sm.wsw2SortProcess('CPT-DC1', 'RT-100001', 'WSW Op');
  const a = await sm.getAsset('RT-100001');
  assert.equal(a.status, 'Available at DC');
  assert.equal(a.home_site_code, 'CPT-DC1');
});

test('Damaged Asset Scan-Out removes the asset from active fleet and logs an exception', async () => {
  await seedMinimal();
  await sm.damagedScanOut('RT-100001', 'Cracked frame', 'TDT Clerk');
  assert.equal((await sm.getAsset('RT-100001')).status, 'Damaged / Written Off');
  const exceptions = await db.exceptions.find({ asset_id: 'RT-100001', type: 'Damaged' });
  assert.equal(exceptions.length, 1);
  await assert.rejects(() => sm.damagedScanOut('RT-100001', 'again', 'op'), /already marked damaged/);
});

test('Maintenance out/in round trip', async () => {
  await seedMinimal();
  await sm.maintenanceOut('JHB-DC1', 'RT-100001', 'Wheel replacement', 'Op');
  assert.equal((await sm.getAsset('RT-100001')).status, 'In Maintenance');
  await sm.maintenanceIn('JHB-DC1', 'RT-100001', 'Op');
  assert.equal((await sm.getAsset('RT-100001')).status, 'Available at DC');
});

test('GLS custody out/in round trip', async () => {
  await seedMinimal();
  await sm.glsCustodyOut('JHB-DC1', 'RT-100001', 'GLS Johannesburg', 'Op');
  assert.equal((await sm.getAsset('RT-100001')).status, 'With GLS Vendor: GLS Johannesburg');
  await sm.glsCustodyIn('JHB-DC1', 'RT-100001', 'Op');
  assert.equal((await sm.getAsset('RT-100001')).status, 'Available at DC');
});

test('Inter-DC transfer out/in round trip, and rejects intake at the wrong site', async () => {
  await seedMinimal();
  await sm.interDcOut('JHB-DC1', 'RT-100001', 'CPT-DC1', 'Op');
  assert.equal((await sm.getAsset('RT-100001')).status, 'Inter-DC Transfer to CPT-DC1');
  await assert.rejects(() => sm.interDcIn('JHB-DC1', 'RT-100001', 'Op'), /not an inbound transfer/);
  await sm.interDcIn('CPT-DC1', 'RT-100001', 'Op');
  const a = await sm.getAsset('RT-100001');
  assert.equal(a.status, 'Available at DC');
  assert.equal(a.home_site_code, 'CPT-DC1');
});

test('every write inside a touch point carries the transaction session', async () => {
  // The MongoDB counterpart of the old placeholder-rewriter test: the
  // one place in db.js where a mistake would be invisible per call and
  // catastrophic in aggregate. A wrapper that quietly dropped the
  // session would still pass every assertion above — the writes would
  // simply commit outside the transaction and survive a rollback — so
  // assert the plumbing directly rather than only its effects.
  await db.ready();
  await db.transaction(async (tx) => {
    assert.ok(tx.session, 'the executor handed to fn must carry a session');
    assert.ok(tx.session.inTransaction(), 'and that session must be inside the transaction');
    for (const key of ['assets', 'manifests', 'manifestAssets', 'custodyLog', 'exceptions', 'fleetCounters']) {
      assert.ok(tx[key], `tx.${key} must exist`);
      assert.notEqual(tx[key], db[key], `tx.${key} must not be the sessionless module-level accessor`);
    }
  });
});

test('the schema validator rejects a document the SQL CHECK constraints would have', async () => {
  // The CHECK constraints did not survive the move to MongoDB as
  // constraints; they survived as $jsonSchema validators, and this is
  // the test that says so. Without it, "we kept the enums" is a comment
  // in src/schema.js and nothing more.
  await seedMinimal();
  await assert.rejects(
    () => db.sites.insertOne(siteDoc('BAD-1', 'Bad', 'Warehouse')),
    /validation/i,
    'site.type is restricted to DC | Hub | Returns | GLS'
  );
  await assert.rejects(
    () => db.assets.insertOne(assetDoc('RT-900001', { type: 'Pallet' })),
    /validation/i,
    'asset.type is restricted to Rolltainer | Hyper Cage'
  );
});
