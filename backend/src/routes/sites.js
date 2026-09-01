// src/routes/sites.js
const { Router } = require('../lib/httpApp');
const { requireAuth, requireRole } = require('../middleware/auth');
const db = require('../db');
const cache = require('../lib/cache');

const router = new Router();

// GET is intentionally public — site names/codes aren't sensitive, and
// the login screen needs to populate a site picker before an operator
// has a token to authenticate with. Write operations below still
// require DC-role auth.
router.get('/', (req, res) => {
  const { type } = req.query;
  const rows = type
    ? db.all(`SELECT * FROM sites WHERE type = ? ORDER BY name`, [type])
    : db.all(`SELECT * FROM sites ORDER BY type, name`);
  res.json(rows);
});

router.post('/', requireAuth, requireRole('DC'), (req, res) => {
  const { code, name, type, lat, lng } = req.body || {};
  if (!code || !name || !type) return res.status(400).json({ error: 'code, name, and type are required' });
  if (!['DC', 'Hub', 'Returns', 'GLS'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  const exists = db.get(`SELECT 1 FROM sites WHERE code = ?`, [code]);
  if (exists) return res.status(409).json({ error: 'a site with that code already exists' });
  db.run(`INSERT INTO sites (code, name, type, lat, lng) VALUES (?, ?, ?, ?, ?)`, [code, name, type, lat ?? null, lng ?? null]);
  res.status(201).json(db.get(`SELECT * FROM sites WHERE code = ?`, [code]));
});

router.delete('/:code', requireAuth, requireRole('DC'), async (req, res) => {
  const { code } = req.params;
  const inUse = db.get(
    `SELECT 1 FROM assets WHERE home_site_code = ? OR transfer_to_code = ?
     UNION SELECT 1 FROM manifests WHERE origin_dc_code = ? OR destination_hub_code = ? OR origin_hub_code = ? OR destination_dc_code = ?`,
    [code, code, code, code, code, code]
  );
  if (inUse) return res.status(409).json({ error: 'site is in use by an asset or manifest' });
  const result = db.run(`DELETE FROM sites WHERE code = ?`, [code]);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  await cache.delPrefix('dashboard:');
  res.status(204).end();
});

module.exports = router;
