// src/__tests__/stateMachine.test.js
process.env.DB_PATH = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const sm = require('../lib/stateMachine');

function resetDb() {
  db.run(`DELETE FROM custody_log`);
  db.run(`DELETE FROM exceptions`);
  db.run(`DELETE FROM manifest_assets`);
  db.run(`DELETE FROM manifests`);
  db.run(`DELETE FROM assets`);
  db.run(`DELETE FROM sites`);
}

function seedMinimal() {
  resetDb();
  db.run(`INSERT INTO sites (code, name, type) VALUES ('JHB-DC1','JHB-DC1','DC')`);
  db.run(`INSERT INTO sites (code, name, type) VALUES ('Alberton (ALB)','Alberton','Hub')`);
  db.run(`INSERT INTO sites (code, name, type) VALUES ('CPT-DC1','CPT-DC1','DC')`);
  const insertAsset = (id) => db.run(
    `INSERT INTO assets (id, type, home_site_code, status, stage, registered_at) VALUES (?, 'Rolltainer', 'JHB-DC1', 'Available at DC', 0, ?)`,
    [id, sm.nowIso()]
  );
  insertAsset('RT-100001');
  insertAsset('RT-100002');
  insertAsset('RT-100003');
}

test('TP1: opening a dispatch creates a manifest and moves scanned assets to In Dispatch', () => {
  seedMinimal();
  const { manifestId } = sm.tp1DispatchOpen('JHB-DC1', 'T. Nkosi', ['RT-100001', 'RT-100002']);
  const a1 = sm.getAsset('RT-100001');
  assert.equal(a1.status, 'In Dispatch');
  assert.equal(a1.manifest_id, manifestId);
  const manifest = sm.getManifest(manifestId);
  assert.equal(manifest.stage, 1);
  assert.equal(manifest.kind, 'dispatch');
});

test('TP1: rejects an asset that is not available at the claimed site', () => {
  seedMinimal();
  db.run(`UPDATE assets SET home_site_code='CPT-DC1' WHERE id='RT-100001'`);
  assert.throws(() => sm.tp1DispatchOpen('JHB-DC1', 'T. Nkosi', ['RT-100001']), /not available/);
});

test('TP2: a missing asset is flagged Outstanding and logs a Missed Scan exception, but the manifest still closes', () => {
  seedMinimal();
  const { manifestId } = sm.tp1DispatchOpen('JHB-DC1', 'T. Nkosi', ['RT-100001', 'RT-100002']);
  const result = sm.tp2DispatchClose(manifestId, 'Alberton (ALB)', ['RT-100001'], 'T. Nkosi');
  assert.deepEqual(result.missing, ['RT-100002']);

  const a1 = sm.getAsset('RT-100001');
  assert.equal(a1.status, 'Dispatched — In Transit');
  const a2 = sm.getAsset('RT-100002');
  assert.equal(a2.outstanding_reason, 'Missing at Dispatch Close');

  const manifest = sm.getManifest(manifestId);
  assert.equal(manifest.stage, 2, 'manifest closes even with a missing asset');

  const exceptions = db.all(`SELECT * FROM exceptions WHERE asset_id = 'RT-100002'`);
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].type, 'Missed Scan');
});

test('full loop: TP1 → TP2 → TP3 → TP4 → TP5 → TP6 → TP7 returns the asset to Available at DC', () => {
  seedMinimal();
  const { manifestId } = sm.tp1DispatchOpen('JHB-DC1', 'Op', ['RT-100001']);
  sm.tp2DispatchClose(manifestId, 'Alberton (ALB)', ['RT-100001'], 'Op');
  sm.tp3TdtIntake(manifestId, ['RT-100001'], 'Driver');
  const { ePodId } = sm.tp4TdtLoaded(manifestId, {}, 'Driver');
  assert.ok(ePodId.startsWith('ePOD-'));
  sm.tp5HubIntake(manifestId, 'Alberton (ALB)', ['RT-100001'], 'HubOp');
  assert.equal(sm.getAsset('RT-100001').status, 'At Hub: Alberton (ALB)');

  const { returnManifestId } = sm.tp6HubEmptyCollection('Alberton (ALB)', ['RT-100001'], 'HubOp');
  assert.equal(sm.getAsset('RT-100001').status, 'Ready for Return — Awaiting Collection');

  sm.tp7ReturnReceipt(returnManifestId, 'JHB-DC1', ['RT-100001'], 'Op', false);
  const final = sm.getAsset('RT-100001');
  assert.equal(final.status, 'Available at DC');
  assert.equal(final.home_site_code, 'JHB-DC1');

  const custody = db.all(`SELECT note FROM custody_log WHERE asset_id = 'RT-100001' ORDER BY id`);
  assert.equal(custody.length, 7, 'one custody entry per touch point');
});

test('TP4 blocks confirmation until every missing asset has a reason code', () => {
  seedMinimal();
  const { manifestId } = sm.tp1DispatchOpen('JHB-DC1', 'Op', ['RT-100001', 'RT-100002']);
  sm.tp2DispatchClose(manifestId, 'Alberton (ALB)', ['RT-100001', 'RT-100002'], 'Op');
  sm.tp3TdtIntake(manifestId, ['RT-100001'], 'Driver'); // RT-100002 not scanned -> outstanding
  assert.throws(() => sm.tp4TdtLoaded(manifestId, {}, 'Driver'), /reason code/);
  const { ePodId } = sm.tp4TdtLoaded(manifestId, { 'RT-100002': 'Left behind' }, 'Driver');
  assert.ok(ePodId);
  assert.equal(sm.getAsset('RT-100002').outstanding_reason, 'Not loaded — Left behind');
});

test('TP7 Returns Facility Routing sets status to Available at Returns Facility', () => {
  seedMinimal();
  db.run(`INSERT INTO sites (code, name, type) VALUES ('Returns Facility — Isando','Isando','Returns')`);
  const { manifestId } = sm.tp1DispatchOpen('JHB-DC1', 'Op', ['RT-100001']);
  sm.tp2DispatchClose(manifestId, 'Alberton (ALB)', ['RT-100001'], 'Op');
  sm.tp3TdtIntake(manifestId, ['RT-100001'], 'Driver');
  sm.tp4TdtLoaded(manifestId, {}, 'Driver');
  sm.tp5HubIntake(manifestId, 'Alberton (ALB)', ['RT-100001'], 'HubOp');
  const { returnManifestId } = sm.tp6HubEmptyCollection('Alberton (ALB)', ['RT-100001'], 'HubOp');
  sm.tp7ReturnReceipt(returnManifestId, 'Returns Facility — Isando', ['RT-100001'], 'Op', true);
  assert.equal(sm.getAsset('RT-100001').status, 'Available at Returns Facility');
});

test('WSW: intake accepts a misrouted asset regardless of prior status, sort releases it to active stock', () => {
  seedMinimal();
  sm.wsw1Intake('CPT-DC1', 'RT-100001', 'WSW Op');
  assert.equal(sm.getAsset('RT-100001').status, 'At WSW: CPT-DC1');
  sm.wsw2SortProcess('CPT-DC1', 'RT-100001', 'WSW Op');
  const a = sm.getAsset('RT-100001');
  assert.equal(a.status, 'Available at DC');
  assert.equal(a.home_site_code, 'CPT-DC1');
});

test('Damaged Asset Scan-Out removes the asset from active fleet and logs an exception', () => {
  seedMinimal();
  sm.damagedScanOut('RT-100001', 'Cracked frame', 'TDT Clerk');
  assert.equal(sm.getAsset('RT-100001').status, 'Damaged / Written Off');
  const exceptions = db.all(`SELECT * FROM exceptions WHERE asset_id='RT-100001' AND type='Damaged'`);
  assert.equal(exceptions.length, 1);
  assert.throws(() => sm.damagedScanOut('RT-100001', 'again', 'op'), /already marked damaged/);
});

test('Maintenance out/in round trip', () => {
  seedMinimal();
  sm.maintenanceOut('JHB-DC1', 'RT-100001', 'Wheel replacement', 'Op');
  assert.equal(sm.getAsset('RT-100001').status, 'In Maintenance');
  sm.maintenanceIn('JHB-DC1', 'RT-100001', 'Op');
  assert.equal(sm.getAsset('RT-100001').status, 'Available at DC');
});

test('GLS custody out/in round trip', () => {
  seedMinimal();
  sm.glsCustodyOut('JHB-DC1', 'RT-100001', 'GLS Johannesburg', 'Op');
  assert.equal(sm.getAsset('RT-100001').status, 'With GLS Vendor: GLS Johannesburg');
  sm.glsCustodyIn('JHB-DC1', 'RT-100001', 'Op');
  assert.equal(sm.getAsset('RT-100001').status, 'Available at DC');
});

test('Inter-DC transfer out/in round trip, and rejects intake at the wrong site', () => {
  seedMinimal();
  sm.interDcOut('JHB-DC1', 'RT-100001', 'CPT-DC1', 'Op');
  assert.equal(sm.getAsset('RT-100001').status, 'Inter-DC Transfer to CPT-DC1');
  assert.throws(() => sm.interDcIn('JHB-DC1', 'RT-100001', 'Op'), /not an inbound transfer/);
  sm.interDcIn('CPT-DC1', 'RT-100001', 'Op');
  const a = sm.getAsset('RT-100001');
  assert.equal(a.status, 'Available at DC');
  assert.equal(a.home_site_code, 'CPT-DC1');
});
