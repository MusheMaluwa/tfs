// src/seed.js
//
// Demo data. Safe to re-run: sites and assets are inserted with ON
// CONFLICT DO NOTHING, so seeding an already-seeded database changes
// nothing rather than erroring.
const db = require('./db');

const DC_SITES = [['JHB-DC1', 'JHB-DC1', 'DC'], ['JHB-DC3', 'JHB-DC3', 'DC'], ['CPT-DC1', 'CPT-DC1', 'DC'], ['CPT-DC3', 'CPT-DC3', 'DC'], ['DBN-DC1', 'DBN-DC1', 'DC']];
const HUB_SITES = [['Alberton (ALB)', 'Alberton', 'Hub'], ['Bryanston (BRY)', 'Bryanston', 'Hub'], ['George (GEO)', 'George', 'Hub'], ['Bloemfontein (BLO)', 'Bloemfontein', 'Hub']];
const RETURNS_SITES = [['Returns Facility — Isando', 'Isando', 'Returns']];
const GLS_SITES = [['GLS Johannesburg', 'GLS Johannesburg', 'GLS'], ['GLS Cape Town', 'GLS Cape Town', 'GLS']];

const now = Date.now();
const daysAgo = (n) => new Date(now - n * 86400000).toISOString();

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

  for (const [code, name, type] of [...DC_SITES, ...HUB_SITES, ...RETURNS_SITES, ...GLS_SITES]) {
    await db.run(`INSERT INTO sites (code, name, type) VALUES (?, ?, ?) ON CONFLICT (code) DO NOTHING`, [code, name, type]);
  }

  for (const [id, type, site, status, stage] of demoAssets) {
    await db.run(
      `INSERT INTO assets (id, type, home_site_code, status, stage, registered_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
      [id, type, site, status, stage, daysAgo(30 + Math.floor(Math.random() * 300))]
    );
  }

  await db.run(`UPDATE assets SET hub_arrival_at = ? WHERE id = 'RT-100016'`, [daysAgo(9)]);
  await db.run(`UPDATE assets SET outstanding_reason = 'Missed scan at Hub Intake (seed)', outstanding_since = ? WHERE id = 'RT-100017'`, [daysAgo(2)]);
  // Re-runnable: without this the same demo exception stacks up on
  // every seed.
  await db.run(`DELETE FROM exceptions WHERE asset_id = 'RT-100017' AND note LIKE 'Expected at Hub Intake%'`);
  await db.run(`INSERT INTO exceptions (ts, type, asset_id, note) VALUES (?, 'Missed Scan', 'RT-100017', 'Expected at Hub Intake but not scanned within timeout.')`, [daysAgo(2)]);
  await db.run(`UPDATE fleet_counters SET tagged_fleet = 154, total_fleet = 200 WHERE id = 1`);

  const sites = await db.get(`SELECT COUNT(*)::int AS n FROM sites`);
  const assets = await db.get(`SELECT COUNT(*)::int AS n FROM assets`);
  console.log(`[seed] done (${db.kind()}). Sites: ${sites.n} | Assets: ${assets.n}`);
  await db.close();
}

seed().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
