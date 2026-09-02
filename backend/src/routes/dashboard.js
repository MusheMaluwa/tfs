// src/routes/dashboard.js
const { Router } = require('../lib/httpApp');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const cache = require('../lib/cache');

const router = new Router();

function rollupStatus(asset) {
  if (asset.outstanding_reason) return 'Outstanding';
  const s = asset.status;
  if (s.startsWith('Available')) return 'Available';
  if (s.startsWith('In Dispatch')) return 'In Dispatch';
  if (s.includes('In Transit')) return 'In Transit';
  if (s.startsWith('At Hub')) return 'At Hub';
  if (s.startsWith('At WSW')) return 'At WSW';
  if (s.startsWith('Ready for Return')) return 'Ready for Return';
  if (s === 'Damaged / Written Off') return 'Damaged';
  if (s === 'In Maintenance') return 'Maintenance';
  if (s.startsWith('With GLS Vendor')) return 'GLS Custody';
  if (s.startsWith('Inter-DC Transfer')) return 'Inter-DC Transfer';
  return 'Available';
}

router.get('/summary', requireAuth, async (req, res) => {
  const cacheKey = 'dashboard:summary';
  const cached = await cache.get(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const assets = await db.all(`SELECT * FROM assets`);
  const rollups = {
    Available: 0, 'In Dispatch': 0, 'In Transit': 0, 'At Hub': 0, 'At WSW': 0,
    'Ready for Return': 0, Outstanding: 0, Damaged: 0, Maintenance: 0,
    'GLS Custody': 0, 'Inter-DC Transfer': 0,
  };
  assets.forEach((a) => { rollups[rollupStatus(a)]++; });

  const counters = await db.get(`SELECT * FROM fleet_counters WHERE id = 1`);
  const coveragePct = counters.total_fleet > 0 ? Math.round((counters.tagged_fleet / counters.total_fleet) * 100) : 0;
  const outstandingCount = rollups.Outstanding;
  const lossRate = assets.length ? Math.round((outstandingCount / assets.length) * 1000) / 10 : 0;
  // COUNT() is bigint in Postgres, which node-postgres returns as a
  // string rather than silently losing precision past 2^53. Cast in SQL
  // so this KPI stays a number in the JSON the console reads.
  const exceptionCount = (await db.get(`SELECT COUNT(*)::int AS n FROM exceptions`)).n;

  const siteCounts = {};
  assets.forEach((a) => {
    const key = a.status.startsWith('At Hub:') ? a.status.replace('At Hub: ', '') : a.home_site_code;
    siteCounts[key] = (siteCounts[key] || 0) + 1;
  });

  const payload = { rollups, kpis: { taggingCoveragePct: coveragePct, lossRatePct: lossRate, exceptionCount }, siteCounts, cached: false };
  await cache.set(cacheKey, payload, 20); // 20s TTL, per Solution Architecture §5.3
  res.json(payload);
});

module.exports = router;
