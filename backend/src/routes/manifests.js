// src/routes/manifests.js
const { Router } = require('../lib/httpApp');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

const router = new Router();

/** The four join fields the frontends read off each manifest. */
const JOIN_PROJECTION = { _id: 0, asset_id: 1, expected: 1, scanned: 1, scanned_at: 1 };

router.get('/', requireAuth, async (req, res) => {
  const { kind, stage } = req.query;
  const filter = {};
  if (kind) filter.kind = kind;
  if (stage !== undefined) filter.stage = Number(stage);
  const manifests = await db.manifests.find(filter, { sort: { created_at: -1 } });
  // Include each manifest's asset join (expected/scanned) inline — the
  // frontend's render functions are synchronous and need this available
  // without a second round-trip per manifest.
  //
  // One query for all of them rather than one per manifest: the SQL
  // version fanned out N+1 round-trips through Promise.all, and an
  // $in over an indexed field does the same work in a single call.
  const joins = manifests.length
    ? await db.manifestAssets.find(
      { manifest_id: { $in: manifests.map((m) => m.id) } },
      { projection: { ...JOIN_PROJECTION, manifest_id: 1 } }
    )
    : [];
  const byManifest = new Map(manifests.map((m) => [m.id, []]));
  for (const { manifest_id: manifestId, ...row } of joins) byManifest.get(manifestId).push(row);
  res.json(manifests.map((m) => ({ ...m, assets: byManifest.get(m.id) })));
});

router.get('/:id', requireAuth, async (req, res) => {
  const manifest = await db.manifests.findOne({ _id: req.params.id });
  if (!manifest) return res.status(404).json({ error: 'not found' });
  const assets = await db.manifestAssets.find({ manifest_id: req.params.id }, { projection: JOIN_PROJECTION });
  res.json({ ...manifest, assets });
});

module.exports = router;
