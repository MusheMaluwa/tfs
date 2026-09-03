// src/__tests__/helpers/reset.js
//
// Both suites empty every collection on entry, which is exactly the
// thing you never want pointed at a live fleet. Under SQL that was a
// TRUNCATE guarded by "test:pg requires DATABASE_URL in your shell";
// the guard here is stronger and lives in code rather than in a README:
// the database name must end in `_test`, or nothing is deleted.
//
// The in-process server (no MONGODB_URI) is exempt — it is created
// empty in a temp directory and destroyed at process exit, so there is
// nothing there to protect.

const db = require('../../db');

async function resetDb() {
  await db.ready();
  if (db.kind() !== 'mongodb-memory' && !/_test$/.test(db.name())) {
    throw new Error(
      `refusing to wipe database "${db.name()}": the test suites delete every document, `
      + 'so they only run against a database whose name ends in "_test". '
      + 'Set MONGODB_DB=tfs_test (or unset MONGODB_URI to use the in-process server).'
    );
  }
  await Promise.all([
    db.custodyLog.deleteMany({}),
    db.exceptions.deleteMany({}),
    db.manifestAssets.deleteMany({}),
    db.manifests.deleteMany({}),
    db.assets.deleteMany({}),
    db.sites.deleteMany({}),
  ]);
  await db.fleetCounters.updateOne({ _id: 1 }, { $set: { tagged_fleet: 0, total_fleet: 0 } }, { upsert: true });
}

/** The full document an asset needs, so a fixture can name only the
 *  fields it cares about and still satisfy the schema validator. */
function assetDoc(id, overrides = {}) {
  return {
    _id: id,
    id,
    type: 'Rolltainer',
    home_site_code: 'JHB-DC1',
    status: 'Available at DC',
    stage: 0,
    outstanding_reason: null,
    outstanding_since: null,
    manifest_id: null,
    manifest_kind: null,
    hub_arrival_at: null,
    transfer_to_code: null,
    registered_at: new Date(),
    ...overrides,
  };
}

function siteDoc(code, name, type) {
  return { _id: code, code, name, type, lat: null, lng: null, created_at: new Date() };
}

module.exports = { resetDb, assetDoc, siteDoc };
