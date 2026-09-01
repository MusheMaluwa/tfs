// src/routes/touchpoints.js
//
// Every touch point, WSW step, and non-linear flow endpoint. Business
// logic lives in lib/stateMachine.js; these handlers validate the
// request shape, enforce role, apply the idempotency check, and map
// BusinessError to a 400 (a "no" this API expects to return sometimes,
// not a server fault).

const { Router } = require('../lib/httpApp');
const { requireAuth, requireRole } = require('../middleware/auth');
const sm = require('../lib/stateMachine');
const cache = require('../lib/cache');

const router = new Router();

/** Wraps a handler with idempotency-key checking and BusinessError -> 400 mapping. */
function action(roles, fn) {
  return [
    requireAuth,
    requireRole(...roles),
    async (req, res) => {
      const idKey = req.headers['idempotency-key'];
      if (idKey) {
        const cached = await cache.get(`idem:${idKey}`);
        if (cached) return res.status(cached.status).json(cached.body);
      }
      try {
        const result = await fn(req);
        await cache.delPrefix('dashboard:');
        const body = { ok: true, ...result };
        if (idKey) await cache.set(`idem:${idKey}`, { status: 200, body }, 300);
        res.status(200).json(body);
      } catch (err) {
        if (err instanceof sm.BusinessError) return res.status(400).json({ error: err.message });
        throw err;
      }
    },
  ];
}

router.post('/tp1-open', ...action(['DC'], (req) => {
  const { siteCode, assetIds } = req.body;
  return sm.tp1DispatchOpen(siteCode || req.user.site, req.user.sub, assetIds);
}));

router.post('/tp2-close', ...action(['DC'], (req) => {
  const { manifestId, destinationHubCode, scannedAssetIds } = req.body;
  return sm.tp2DispatchClose(manifestId, destinationHubCode, scannedAssetIds, req.user.sub);
}));

router.post('/tp3-intake', ...action(['TDT'], (req) => {
  const { manifestId, scannedAssetIds } = req.body;
  return sm.tp3TdtIntake(manifestId, scannedAssetIds, req.user.sub);
}));

router.post('/tp4-loaded', ...action(['TDT'], (req) => {
  const { manifestId, notLoadedReasons } = req.body;
  return sm.tp4TdtLoaded(manifestId, notLoadedReasons || {}, req.user.sub);
}));

router.post('/tp5-hub-intake', ...action(['Hub'], (req) => {
  const { manifestId, scannedAssetIds } = req.body;
  return sm.tp5HubIntake(manifestId, req.user.site, scannedAssetIds, req.user.sub);
}));

router.post('/tp6-empty-collection', ...action(['Hub'], (req) => {
  const { stagedAssetIds } = req.body;
  return sm.tp6HubEmptyCollection(req.user.site, stagedAssetIds, req.user.sub);
}));

router.post('/tp7-return-receipt', ...action(['DC'], (req) => {
  const { manifestId, scannedAssetIds, destinationCode, isReturnsFacility } = req.body;
  return sm.tp7ReturnReceipt(manifestId, destinationCode || req.user.site, scannedAssetIds, req.user.sub, !!isReturnsFacility);
}));

router.post('/wsw1-intake', ...action(['WSW'], (req) => {
  const { assetId } = req.body;
  return sm.wsw1Intake(req.user.site, assetId, req.user.sub);
}));

router.post('/wsw2-sort', ...action(['WSW'], (req) => {
  const { assetId } = req.body;
  return sm.wsw2SortProcess(req.user.site, assetId, req.user.sub);
}));

router.post('/damaged-scan-out', ...action(['TDT'], (req) => {
  const { assetId, note } = req.body;
  return sm.damagedScanOut(assetId, note, req.user.sub);
}));

router.post('/maintenance-out', ...action(['DC'], (req) => {
  const { assetId, reason } = req.body;
  return sm.maintenanceOut(req.user.site, assetId, reason, req.user.sub);
}));
router.post('/maintenance-in', ...action(['DC'], (req) => {
  const { assetId } = req.body;
  return sm.maintenanceIn(req.user.site, assetId, req.user.sub);
}));

router.post('/gls-out', ...action(['DC'], (req) => {
  const { assetId, glsSite } = req.body;
  return sm.glsCustodyOut(req.user.site, assetId, glsSite, req.user.sub);
}));
router.post('/gls-in', ...action(['DC'], (req) => {
  const { assetId } = req.body;
  return sm.glsCustodyIn(req.user.site, assetId, req.user.sub);
}));

router.post('/interdc-out', ...action(['DC'], (req) => {
  const { assetId, toSiteCode } = req.body;
  return sm.interDcOut(req.user.site, assetId, toSiteCode, req.user.sub);
}));
router.post('/interdc-in', ...action(['DC'], (req) => {
  const { assetId } = req.body;
  return sm.interDcIn(req.user.site, assetId, req.user.sub);
}));

module.exports = router;
