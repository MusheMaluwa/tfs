// src/__tests__/api.test.js
process.env.DB_PATH = ':memory:';
process.env.AUTH_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const app = require('../server');

db.run(`INSERT INTO sites (code, name, type) VALUES ('JHB-DC1','JHB-DC1','DC')`);
db.run(`INSERT INTO sites (code, name, type) VALUES ('Alberton (ALB)','Alberton','Hub')`);
db.run(`INSERT INTO assets (id, type, home_site_code, status, stage, registered_at) VALUES ('RT-100001','Rolltainer','JHB-DC1','Available at DC',0,datetime('now'))`);
db.run(`INSERT INTO assets (id, type, home_site_code, status, stage, registered_at) VALUES ('RT-100002','Rolltainer','JHB-DC1','Available at DC',0,datetime('now'))`);

let server, base, dcToken;

test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://localhost:${server.address().port}`;

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ operatorName: 'T. Nkosi', role: 'DC', siteCode: 'JHB-DC1' }),
  });
  const login = await loginRes.json();
  dcToken = login.token;
});
test.after(() => server.close());

test('health check responds without auth', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: 'tfs-logistics-backend' });
});

test('GET /api/sites is public (needed for the login screen site picker, before a token exists)', async () => {
  const res = await fetch(`${base}/api/sites`);
  assert.equal(res.status, 200);
  const sites = await res.json();
  assert.ok(sites.some((s) => s.code === 'JHB-DC1'));
});

test('protected routes reject requests with no token', async () => {
  const res = await fetch(`${base}/api/assets`);
  assert.equal(res.status, 401);
});

test('login rejects an unknown site code', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ operatorName: 'X', role: 'DC', siteCode: 'NOPE' }),
  });
  assert.equal(res.status, 400);
});

test('GET /api/assets with a valid token returns the seeded assets', async () => {
  const res = await fetch(`${base}/api/assets`, { headers: { Authorization: `Bearer ${dcToken}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.some((a) => a.id === 'RT-100001'));
});

test('a TDT-role token cannot call a DC-only touch point', async () => {
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ operatorName: 'Driver', role: 'TDT' }),
  });
  const { token } = await loginRes.json();
  const res = await fetch(`${base}/api/touchpoints/tp1-open`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ siteCode: 'JHB-DC1', assetIds: ['RT-100001'] }),
  });
  assert.equal(res.status, 403);
});

test('TP1 open -> TP2 close over real HTTP requests produces the same result as the unit test', async () => {
  const openRes = await fetch(`${base}/api/touchpoints/tp1-open`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${dcToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteCode: 'JHB-DC1', assetIds: ['RT-100001', 'RT-100002'] }),
  });
  assert.equal(openRes.status, 200);
  const { manifestId } = await openRes.json();
  assert.ok(manifestId.startsWith('MAN-'));

  const closeRes = await fetch(`${base}/api/touchpoints/tp2-close`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${dcToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ manifestId, destinationHubCode: 'Alberton (ALB)', scannedAssetIds: ['RT-100001'] }),
  });
  const closeBody = await closeRes.json();
  assert.equal(closeRes.status, 200);
  assert.deepEqual(closeBody.missing, ['RT-100002']);

  const assetRes = await fetch(`${base}/api/assets/RT-100001`, { headers: { Authorization: `Bearer ${dcToken}` } });
  const asset = await assetRes.json();
  assert.equal(asset.status, 'Dispatched — In Transit');
  assert.ok(asset.custodyLog.some((c) => c.note === 'TP2 Dispatch Close'));
});

test('an idempotency key prevents a retried request from double-processing', async () => {
  db.run(`INSERT INTO assets (id, type, home_site_code, status, stage, registered_at) VALUES ('RT-100099','Rolltainer','JHB-DC1','Available at DC',0,datetime('now'))`);
  const idemKey = 'test-idem-key-1';
  const doRequest = () => fetch(`${base}/api/touchpoints/tp1-open`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${dcToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
    body: JSON.stringify({ siteCode: 'JHB-DC1', assetIds: ['RT-100099'] }),
  });
  const r1 = await doRequest();
  const b1 = await r1.json();
  const r2 = await doRequest();
  const b2 = await r2.json();
  assert.equal(b1.manifestId, b2.manifestId, 'second call returns the cached result instead of creating a second manifest');
});

test('dashboard summary reflects live state and respects the cache', async () => {
  const r1 = await fetch(`${base}/api/dashboard/summary`, { headers: { Authorization: `Bearer ${dcToken}` } });
  const b1 = await r1.json();
  assert.equal(b1.cached, false);
  assert.ok(b1.rollups.Available >= 0);

  const r2 = await fetch(`${base}/api/dashboard/summary`, { headers: { Authorization: `Bearer ${dcToken}` } });
  const b2 = await r2.json();
  assert.equal(b2.cached, true, 'second call within the TTL window is served from cache');
});
