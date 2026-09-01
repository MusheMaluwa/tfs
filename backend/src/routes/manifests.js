// src/routes/manifests.js
const { Router } = require('../lib/httpApp');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

const router = new Router();

router.get('/', requireAuth, (req, res) => {
  const { kind, stage } = req.query;
  let sql = `SELECT * FROM manifests WHERE 1=1`;
  const params = [];
  if (kind) { sql += ` AND kind = ?`; params.push(kind); }
  if (stage !== undefined) { sql += ` AND stage = ?`; params.push(Number(stage)); }
  sql += ` ORDER BY created_at DESC`;
  const manifests = db.all(sql, params);
  // Include each manifest's asset join (expected/scanned) inline — the
  // frontend's render functions are synchronous and need this available
  // without a second round-trip per manifest.
  const withAssets = manifests.map((m) => ({
    ...m,
    assets: db.all(`SELECT asset_id, expected, scanned, scanned_at FROM manifest_assets WHERE manifest_id = ?`, [m.id]),
  }));
  res.json(withAssets);
});

router.get('/:id', requireAuth, (req, res) => {
  const manifest = db.get(`SELECT * FROM manifests WHERE id = ?`, [req.params.id]);
  if (!manifest) return res.status(404).json({ error: 'not found' });
  const assets = db.all(`SELECT asset_id, expected, scanned, scanned_at FROM manifest_assets WHERE manifest_id = ?`, [req.params.id]);
  res.json({ ...manifest, assets });
});

module.exports = router;
