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
router.get('/', async (req, res) => {
  const { type } = req.query;
  const rows = type
    ? await db.sites.find({ type }, { sort: { name: 1 } })
    : await db.sites.find({}, { sort: { type: 1, name: 1 } });
  res.json(rows);
});

router.post('/', requireAuth, requireRole('DC'), async (req, res) => {
  const { code, name, type, lat, lng } = req.body || {};
  if (!code || !name || !type) return res.status(400).json({ error: 'code, name, and type are required' });
  if (!['DC', 'Hub', 'Returns', 'GLS'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  const exists = await db.sites.findOne({ _id: code }, { projection: { _id: 1 } });
  if (exists) return res.status(409).json({ error: 'a site with that code already exists' });
  await db.sites.insertOne({
    _id: code,
    code,
    name,
    type,
    lat: lat ?? null,
    lng: lng ?? null,
    created_at: new Date(),
  });
  res.status(201).json(await db.sites.findOne({ _id: code }));
});

router.delete('/:code', requireAuth, requireRole('DC'), async (req, res) => {
  const { code } = req.params;
  // The SQL version was one UNION; MongoDB has no cross-collection
  // query, so this is two lookups and the same answer. Neither is
  // enforced by the engine any more — there are no foreign keys here —
  // which makes this check the only thing standing between a delete and
  // an asset pointing at a site that no longer exists.
  const inUse = await db.assets.findOne(
    { $or: [{ home_site_code: code }, { transfer_to_code: code }] },
    { projection: { _id: 1 } }
  ) || await db.manifests.findOne(
    {
      $or: [
        { origin_dc_code: code }, { destination_hub_code: code },
        { origin_hub_code: code }, { destination_dc_code: code },
      ],
    },
    { projection: { _id: 1 } }
  );
  if (inUse) return res.status(409).json({ error: 'site is in use by an asset or manifest' });
  const result = await db.sites.deleteOne({ _id: code });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'not found' });
  await cache.delPrefix('dashboard:');
  res.status(204).end();
});

module.exports = router;
