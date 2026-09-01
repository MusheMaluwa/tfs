// src/seed.js
const db = require('./db');

const DC_SITES = [['JHB-DC1', 'JHB-DC1', 'DC'], ['JHB-DC3', 'JHB-DC3', 'DC'], ['CPT-DC1', 'CPT-DC1', 'DC'], ['CPT-DC3', 'CPT-DC3', 'DC'], ['DBN-DC1', 'DBN-DC1', 'DC']];
const HUB_SITES = [['Alberton (ALB)', 'Alberton', 'Hub'], ['Bryanston (BRY)', 'Bryanston', 'Hub'], ['George (GEO)', 'George', 'Hub'], ['Bloemfontein (BLO)', 'Bloemfontein', 'Hub']];
const RETURNS_SITES = [['Returns Facility — Isando', 'Isando', 'Returns']];
const GLS_SITES = [['GLS Johannesburg', 'GLS Johannesburg', 'GLS'], ['GLS Cape Town', 'GLS Cape Town', 'GLS']];

for (const [code, name, type] of [...DC_SITES, ...HUB_SITES, ...RETURNS_SITES, ...GLS_SITES]) {
  db.run(`INSERT OR IGNORE INTO sites (code, name, type) VALUES (?, ?, ?)`, [code, name, type]);
}

const now = Date.now();
const daysAgo = (n) => new Date(now - n * 86400000).toISOString();

const demoAssets = [
  ['RT-100001', 'Hyper Cage', 'JHB-DC1', 'Available at DC', 0],
  ['RT-100002', 'Rolltainer', 'JHB-DC3', 'Available at DC', 0],
  ['RT-100003', 'Hyper Cage', 'CPT-DC1', 'Available at DC', 0],
  ['RT-100004', 'Rolltainer', 'CPT-DC3', 'Available at DC', 0],
  ['RT-100005', 'Hyper Cage', 'DBN-DC1', 'Available at DC', 0],
  ['RT-100006', 'Rolltainer', 'JHB-DC1', 'Available at DC', 0],
  ['RT-100016', 'Rolltainer', 'CPT-DC1', 'At Hub: George (GEO)', 5],
  ['RT-100017', 'Hyper Cage', 'DBN-DC1', 'Available at DC', 0],
  ['RT-100018', 'Hyper Cage', 'JHB-DC1', 'Damaged / Written Off', 0],
  ['RT-100019', 'Rolltainer', 'CPT-DC1', 'In Maintenance', 0],
];
for (const [id, type, site, status, stage] of demoAssets) {
  db.run(`INSERT OR IGNORE INTO assets (id, type, home_site_code, status, stage, registered_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, type, site, status, stage, daysAgo(30 + Math.floor(Math.random() * 300))]);
}

db.run(`UPDATE assets SET hub_arrival_at = ? WHERE id = 'RT-100016'`, [daysAgo(9)]);
db.run(`UPDATE assets SET outstanding_reason = 'Missed scan at Hub Intake (seed)', outstanding_since = ? WHERE id = 'RT-100017'`, [daysAgo(2)]);
db.run(`INSERT INTO exceptions (ts, type, asset_id, note) VALUES (?, 'Missed Scan', 'RT-100017', 'Expected at Hub Intake but not scanned within timeout.')`, [daysAgo(2)]);
db.run(`UPDATE fleet_counters SET tagged_fleet = 154, total_fleet = 200 WHERE id = 1`);

console.log('[seed] done. Sites:', db.get('SELECT COUNT(*) n FROM sites').n, '| Assets:', db.get('SELECT COUNT(*) n FROM assets').n);
