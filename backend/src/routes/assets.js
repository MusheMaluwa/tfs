// src/routes/assets.js
const { Router } = require('../lib/httpApp');
const { requireAuth, requireRole } = require('../middleware/auth');
const db = require('../db');
const cache = require('../lib/cache');

const router = new Router();

router.get('/', requireAuth, async (req, res) => {
  const { type, site, search } = req.query;
  let sql = `SELECT * FROM assets WHERE 1=1`;
  const params = [];
  if (type) { sql += ` AND type = ?`; params.push(type); }
  if (site) { sql += ` AND home_site_code = ?`; params.push(site); }
  if (search) { sql += ` AND id LIKE ?`; params.push(`%${search}%`); }
  sql += ` ORDER BY id`;
  res.json(await db.all(sql, params));
});

router.get('/:id', requireAuth, async (req, res) => {
  const asset = await db.get(`SELECT * FROM assets WHERE id = ?`, [req.params.id]);
  if (!asset) return res.status(404).json({ error: 'not found' });
  const custodyLog = await db.all(`SELECT ts, note, operator FROM custody_log WHERE asset_id = ? ORDER BY ts DESC`, [req.params.id]);
  res.json({ ...asset, custodyLog });
});

router.post('/', requireAuth, requireRole('DC'), async (req, res) => {
  const { type, homeSiteCode } = req.body || {};
  let { id } = req.body || {};
  if (!type || !homeSiteCode) return res.status(400).json({ error: 'type and homeSiteCode are required' });
  if (!['Rolltainer', 'Hyper Cage'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  const site = await db.get(`SELECT 1 FROM sites WHERE code = ?`, [homeSiteCode]);
  if (!site) return res.status(400).json({ error: 'unknown homeSiteCode' });

  if (!id) {
    const row = await db.get(`SELECT id FROM assets WHERE id LIKE 'RT-%' ORDER BY id DESC LIMIT 1`);
    const nextNum = row ? parseInt(row.id.replace('RT-', ''), 10) + 1 : 100001;
    id = 'RT-' + String(nextNum).padStart(6, '0');
  }
  const exists = await db.get(`SELECT 1 FROM assets WHERE id = ?`, [id]);
  if (exists) return res.status(409).json({ error: 'barcode already registered' });

  // One transaction: an asset row that exists without its counter
  // increment would quietly skew the tagging-coverage KPI.
  await db.transaction(async (tx) => {
    await tx.run(`INSERT INTO assets (id, type, home_site_code, status, stage, registered_at) VALUES (?, ?, ?, 'Available at DC', 0, ?)`, [id, type, homeSiteCode, new Date().toISOString()]);
    await tx.run(`UPDATE fleet_counters SET tagged_fleet = tagged_fleet + 1 WHERE id = 1`);
  });
  await cache.delPrefix('dashboard:');
  res.status(201).json(await db.get(`SELECT * FROM assets WHERE id = ?`, [id]));
});

module.exports = router;
