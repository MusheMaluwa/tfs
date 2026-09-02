// src/__tests__/stateMachine.test.js
//
// Runs against a real PostgreSQL. `PGLITE_PATH=':memory:'` gets the
// embedded engine, so the suite needs no server and no container — but
// it is the same engine, the same dialect and the same driver-facing
// code path as production. Set DATABASE_URL to run this identical suite
// against a real PostgreSQL server:
//
//   DATABASE_URL=postgres://tfs:tfs@localhost:5432/tfs_test npm test
//
// Every call is awaited because the database layer is async now (see
// src/db.js) — a network round-trip cannot be made to look synchronous.
process.env.PGLITE_PATH = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const sm = require('../lib/stateMachine');

async function resetDb() {
  // One statement, so the foreign keys between these tables never see a
  // half-emptied database. RESTART IDENTITY keeps custody_log ids
  // comparable between tests.
  await db.run(`TRUNCATE custody_log, exceptions, manifest_assets, manifests, assets, sites RESTART IDENTITY CASCADE`);
}

async function seedMinimal() {
  await db.ready();
  await resetDb();
  await db.run(`INSERT INTO sites (code, name, type) VALUES ('JHB-DC1','JHB-DC1','DC')`);
  await db.run(`INSERT INTO sites (code, name, type) VALUES ('Alberton (ALB)','Alberton','Hub')`);
  await db.run(`INSERT INTO sites (code, name, type) VALUES ('CPT-DC1','CPT-DC1','DC')`);
  const insertAsset = (id) => db.run(
    `INSERT INTO assets (id, type, home_site_code, status, stage, registered_at) VALUES (?, 'Rolltainer', 'JHB-DC1', 'Available at DC', 0, ?)`,
    [id, sm.nowIso()]
  );
  await insertAsset('RT-100001');
  await insertAsset('RT-100002');
  await insertAsset('RT-100003');
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
  await db.run(`UPDATE assets SET home_site_code='CPT-DC1' WHERE id='RT-100001'`);
  await assert.rejects(() => sm.tp1DispatchOpen('JHB-DC1', 'T. Nkosi', ['RT-100001']), /not available/);
});

test('TP1: a rejected asset rolls the whole manifest back rather than leaving a half-open one', async () => {
  // Worth asserting explicitly now that transactions run over a
  // connection pool: a statement issued outside the transaction handle
  // would commit on its own and survive this rollback.
  await seedMinimal();
  await db.run(`UPDATE assets SET home_site_code='CPT-DC1' WHERE id='RT-100002'`);
  await assert.rejects(
    () => sm.tp1DispatchOpen('JHB-DC1', 'Op', ['RT-100001', 'RT-100002']),
    /not available/
  );
  const manifests = await db.all(`SELECT * FROM manifests`);
  assert.equal(manifests.length, 0, 'no manifest row should survive the failed open');
  const custody = await db.all(`SELECT * FROM custody_log`);
  assert.equal(custody.length, 0, 'no custody entry should survive either');
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

  const exceptions = await db.all(`SELECT * FROM exceptions WHERE asset_id = 'RT-100002'`);
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

  const custody = await db.all(`SELECT note FROM custody_log WHERE asset_id = 'RT-100001' ORDER BY id`);
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
  const nineDaysAgo = new Date(Date.now() - 9 * 86400000).toISOString();
  await db.run(`UPDATE assets SET hub_arrival_at = ? WHERE id = 'RT-100002'`, [nineDaysAgo]);

  await sm.tp6HubEmptyCollection('Alberton (ALB)', ['RT-100001'], 'HubOp');
  const aged = await db.all(`SELECT * FROM exceptions WHERE type = 'Aged at Hub'`);
  assert.equal(aged.length, 1);
  assert.equal(aged[0].asset_id, 'RT-100002');
  assert.match(aged[0].note, /9 days/);
});

test('TP7 Returns Facility Routing sets status to Available at Returns Facility', async () => {
  await seedMinimal();
  await db.run(`INSERT INTO sites (code, name, type) VALUES ('Returns Facility — Isando','Isando','Returns')`);
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
  const exceptions = await db.all(`SELECT * FROM exceptions WHERE asset_id='RT-100001' AND type='Damaged'`);
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

test('the ? placeholders every route is written with become Postgres $n, and quoted text is left alone', async () => {
  // The rewrite in db.js is the single point where a mistake would turn
  // every query in the codebase into a syntax error or, worse, shift a
  // parameter silently.
  const t = db._toPgPlaceholders;
  assert.equal(t(`SELECT * FROM a WHERE x = ? AND y = ?`), 'SELECT * FROM a WHERE x = $1 AND y = $2');
  assert.equal(t(`SELECT * FROM a WHERE note = 'why?' AND x = ?`), "SELECT * FROM a WHERE note = 'why?' AND x = $1");
  assert.equal(t(`SELECT "odd?column" FROM a WHERE x = ?`), 'SELECT "odd?column" FROM a WHERE x = $1');
  assert.equal(t(`SELECT * FROM a WHERE s = 'it''s ok?' AND x = ?`), "SELECT * FROM a WHERE s = 'it''s ok?' AND x = $1");
  assert.equal(t(`SELECT 1`), 'SELECT 1');
});
