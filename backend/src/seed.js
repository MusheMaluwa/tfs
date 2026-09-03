// src/seed.js
//
// Demo data. Safe to re-run: sites and assets go in through $setOnInsert
// upserts, so seeding an already-seeded database changes nothing rather
// than erroring or overwriting whatever state the fleet is in.
const db = require('./db');

const DC_SITES = [['JHB-DC1', 'JHB-DC1', 'DC'], ['JHB-DC3', 'JHB-DC3', 'DC'], ['CPT-DC1', 'CPT-DC1', 'DC'], ['CPT-DC3', 'CPT-DC3', 'DC'], ['DBN-DC1', 'DBN-DC1', 'DC']];
const HUB_SITES = [['Alberton (ALB)', 'Alberton', 'Hub'], ['Bryanston (BRY)', 'Bryanston', 'Hub'], ['George (GEO)', 'George', 'Hub'], ['Bloemfontein (BLO)', 'Bloemfontein', 'Hub']];
const RETURNS_SITES = [['Returns Facility — Isando', 'Isando', 'Returns']];
const GLS_SITES = [['GLS Johannesburg', 'GLS Johannesburg', 'GLS'], ['GLS Cape Town', 'GLS Cape Town', 'GLS']];

const now = Date.now();
const daysAgo = (n) => new Date(now - n * 86400000);

const demoAssets = [
  ['RT-100001', 'Hyper Cage', 'JHB-DC1', 'Available at DC', 1],
  ['RT-100002', 'Rolltainer', 'JHB-DC3', 'Available at DC', 1],
  ['RT-100003', 'Hyper Cage', 'CPT-DC1', 'Available at DC', 0],
  ['RT-100004', 'Rolltainer', 'CPT-DC3', 'Available at DC', 0],
  ['RT-100005', 'Hyper Cage', 'DBN-DC1', 'Available at DC', 0],
  ['RT-100006', 'Rolltainer', 'JHB-DC1', 'Available at DC', 0],
  ['RT-100016', 'Rolltainer', 'CPT-DC1', 'At Hub: George (GEO)', 5],
  ['RT-100017', 'Hyper Cage', 'DBN-DC1', 'Available at DC', 0],
  ['RT-100018', 'Hyper Cage', 'JHB-DC1', 'Damaged / Written Off', 0],
  ['RT-100019', 'Rolltainer', 'CPT-DC1', 'In Maintenance', 0],
];

async function seed() {
  await db.ready();
  if (db.kind() === 'mongodb-memory') {
    // Worth saying out loud: the in-process server lives in a temp
    // directory and is thrown away when this process exits, so seeding
    // it accomplishes nothing. Unlike the embedded Postgres this
    // replaced, there is no on-disk data directory to seed into.
    console.warn('[seed] MONGODB_URI is not set, so this is seeding the throwaway in-process MongoDB.');
    console.warn('[seed] Nothing will persist. Set MONGODB_URI (see backend/.env) and re-run.');
  }

  for (const [code, name, type] of [...DC_SITES, ...HUB_SITES, ...RETURNS_SITES, ...GLS_SITES]) {
    await db.sites.updateOne(
      { _id: code },
      { $setOnInsert: { code, name, type, lat: null, lng: null, created_at: new Date() } },
      { upsert: true }
    );
  }

  for (const [id, type, site, status, stage] of demoAssets) {
    await db.assets.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          id,
          type,
          home_site_code: site,
          status,
          stage,
          outstanding_reason: null,
          outstanding_since: null,
          manifest_id: null,
          manifest_kind: null,
          hub_arrival_at: null,
          transfer_to_code: null,
          registered_at: daysAgo(30 + Math.floor(Math.random() * 300)),
        },
      },
      { upsert: true }
    );
  }

  await db.assets.updateOne({ _id: 'RT-100016' }, { $set: { hub_arrival_at: daysAgo(9) } });
  await db.assets.updateOne({ _id: 'RT-100017' }, {
    $set: { outstanding_reason: 'Missed scan at Hub Intake (seed)', outstanding_since: daysAgo(2) },
  });
  // Re-runnable: without this the same demo exception stacks up on
  // every seed.
  await db.exceptions.deleteMany({ asset_id: 'RT-100017', note: { $regex: '^Expected at Hub Intake' } });
  const exceptionId = db.newId();
  await db.exceptions.insertOne({
    _id: exceptionId,
    id: exceptionId,
    ts: daysAgo(2),
    type: 'Missed Scan',
    asset_id: 'RT-100017',
    note: 'Expected at Hub Intake but not scanned within timeout.',
  });
  await db.fleetCounters.updateOne({ _id: 1 }, { $set: { tagged_fleet: 154, total_fleet: 200 } });

  const sites = await db.sites.countDocuments({});
  const assets = await db.assets.countDocuments({});
  console.log(`[seed] done (${db.kind()}, database "${db.name()}"). Sites: ${sites} | Assets: ${assets}`);
  await db.close();
}

seed().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
