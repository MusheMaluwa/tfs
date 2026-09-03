// src/routes/assets.js
const { Router } = require('../lib/httpApp');
const { requireAuth, requireRole } = require('../middleware/auth');
const db = require('../db');
const cache = require('../lib/cache');

const router = new Router();

/** `search` goes into a $regex, so it has to be neutralised first —
 *  otherwise `?search=.*` scans the fleet and `?search=(((` throws. The
 *  SQL version passed it to LIKE, where the equivalent risk was a lone
 *  `%`; a regex is a far bigger surface, so this is not optional. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', requireAuth, async (req, res) => {
  const { type, site, search } = req.query;
  const filter = {};
  if (type) filter.type = type;
  if (site) filter.home_site_code = site;
  // Case-sensitive, matching the LIKE this replaced: barcodes are
  // uppercase and the scanner submits them as scanned.
  if (search) filter.id = { $regex: escapeRegex(search) };
  res.json(await db.assets.find(filter, { sort: { id: 1 } }));
});

router.get('/:id', requireAuth, async (req, res) => {
  const asset = await db.assets.findOne({ _id: req.params.id });
  if (!asset) return res.status(404).json({ error: 'not found' });
  const custodyLog = await db.custodyLog.find(
    { asset_id: req.params.id },
    { projection: { _id: 0, ts: 1, note: 1, operator: 1 }, sort: { ts: -1 } }
  );
  res.json({ ...asset, custodyLog });
});

router.post('/', requireAuth, requireRole('DC'), async (req, res) => {
  const { type, homeSiteCode } = req.body || {};
  let { id } = req.body || {};
  if (!type || !homeSiteCode) return res.status(400).json({ error: 'type and homeSiteCode are required' });
  if (!['Rolltainer', 'Hyper Cage'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  const site = await db.sites.findOne({ _id: homeSiteCode }, { projection: { _id: 1 } });
  if (!site) return res.status(400).json({ error: 'unknown homeSiteCode' });

  if (!id) {
    const [last] = await db.assets.find(
      { id: { $regex: '^RT-' } },
      { projection: { _id: 0, id: 1 }, sort: { id: -1 }, limit: 1 }
    );
    const nextNum = last ? parseInt(last.id.replace('RT-', ''), 10) + 1 : 100001;
    id = 'RT-' + String(nextNum).padStart(6, '0');
  }
  const exists = await db.assets.findOne({ _id: id }, { projection: { _id: 1 } });
  if (exists) return res.status(409).json({ error: 'barcode already registered' });

  // One transaction: an asset that exists without its counter increment
  // would quietly skew the tagging-coverage KPI.
  await db.transaction(async (tx) => {
    await tx.assets.insertOne({
      _id: id,
      id,
      type,
      home_site_code: homeSiteCode,
      status: 'Available at DC',
      stage: 0,
      outstanding_reason: null,
      outstanding_since: null,
      manifest_id: null,
      manifest_kind: null,
      hub_arrival_at: null,
      transfer_to_code: null,
      registered_at: new Date(),
    });
    await tx.fleetCounters.updateOne({ _id: 1 }, { $inc: { tagged_fleet: 1 } });
  });
  await cache.delPrefix('dashboard:');
  res.status(201).json(await db.assets.findOne({ _id: id }));
});

module.exports = router;
