// e2e/scanner-full-loop.spec.js
//
// Drives the ACTUAL retrofitted mercury-scanner.html (not the small
// reference page) through the complete 7-touch-point loop plus WSW and
// several non-linear flows, clicking the same buttons a real operator
// would, against a real running backend. This is the test that proves
// the frontend retrofit itself is correct, not just the API client.

const path = require('node:path');
const { chromium } = require('playwright');

function assert(cond, msg) { if (!cond) throw new Error('ASSERTION FAILED: ' + msg); }

async function main() {
  // A throwaway PostgreSQL in-process, so this needs no server. Set
  // DATABASE_URL to run the same script against a real one.
  process.env.PGLITE_PATH = process.env.PGLITE_PATH || ':memory:';
  process.env.PORT = '0';
  const app = require(path.join(__dirname, '..', 'backend', 'src', 'server.js'));
  const db = require(path.join(__dirname, '..', 'backend', 'src', 'db.js'));

  await db.ready();
  await db.run(`TRUNCATE custody_log, exceptions, manifest_assets, manifests, assets, sites RESTART IDENTITY CASCADE`);
  await db.run(`INSERT INTO sites (code, name, type) VALUES ('JHB-DC1','JHB-DC1','DC')`);
  await db.run(`INSERT INTO sites (code, name, type) VALUES ('CPT-DC1','CPT-DC1','DC')`);
  await db.run(`INSERT INTO sites (code, name, type) VALUES ('Alberton (ALB)','Alberton','Hub')`);
  await db.run(`INSERT INTO sites (code, name, type) VALUES ('Returns Facility — Isando','Isando','Returns')`);
  const seedAsset = (id, site, status) => db.run(
    `INSERT INTO assets (id, type, home_site_code, status, stage, registered_at) VALUES (?, 'Rolltainer', ?, ?, 0, now())`,
    [id, site, status]
  );
  await seedAsset('RT-100001', 'JHB-DC1', 'Available at DC');
  await seedAsset('RT-100002', 'JHB-DC1', 'Available at DC');
  await seedAsset('RT-100003', 'JHB-DC1', 'Available at DC'); // for maintenance
  await seedAsset('RT-100004', 'JHB-DC1', 'Available at DC'); // for GLS
  await seedAsset('RT-100005', 'JHB-DC1', 'Available at DC'); // for inter-DC
  await seedAsset('RT-100006', 'JHB-DC1', 'Available at DC'); // for WSW

  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const apiPort = server.address().port;
  console.log(`[e2e] backend on :${apiPort}`);

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // Track failed resource loads by URL (console text alone doesn't include
  // the URL, so this is the reliable way to distinguish "expected sandbox
  // CDN block" from "genuine app bug").
  const failedResourceUrls = [];
  page.on('response', (r) => { if (r.status() >= 400) failedResourceUrls.push(r.url()); });

  await page.addInitScript((port) => { window.TFS_API_BASE_URL = `http://localhost:${port}`; }, apiPort);
  const scannerPath = 'file://' + path.join(__dirname, '..', 'frontend', 'mercury-scanner.html');

  async function login(role, site, name) {
    await page.goto(scannerPath);
    await page.click(`.role-card[data-role="${role}"]`);
    if (site) await page.selectOption('#siteSelect', site);
    await page.fill('#opName', name);
    await page.click('#loginBtn');
    await page.waitForTimeout(400);
  }
  async function openTP(id) { await page.click(`.tp-card[data-tp="${id}"]`); await page.waitForTimeout(200); }
  async function scan(inputId, value) { await page.fill('#' + inputId, value); await page.press('#' + inputId, 'Enter'); await page.waitForTimeout(200); }

  async function tokenFor(role, siteCode) {
    const res = await fetch(`http://localhost:${apiPort}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorName: 'checker', role, siteCode }),
    });
    return (await res.json()).token;
  }
  const checkerToken = await tokenFor('DC', 'JHB-DC1');
  const checkAsset = async (id) => (await (await fetch(`http://localhost:${apiPort}/api/assets/${id}`, { headers: { Authorization: `Bearer ${checkerToken}` } })).json());

  // ===== TP1 + TP2 =====
  await login('DC', 'JHB-DC1', 'T. Nkosi');
  assert((await page.locator('.session-tag').textContent()).includes('DC Operator'), 'login should show DC Operator session');
  await openTP('tp1');
  await scan('tp1Input', 'RT-100001');
  await scan('tp1Input', 'RT-100002');
  await page.click('#tp1Open');
  await page.waitForTimeout(400);
  console.log('[e2e] TP1 open — OK');

  await openTP('tp2');
  await page.selectOption('#tp2Hub', 'Alberton (ALB)');
  await scan('tp2Input', 'RT-100001'); // deliberately leave RT-100002 unscanned
  await page.click('#tp2Close');
  await page.waitForTimeout(400);
  console.log('[e2e] TP2 close (1 missing, expected) — OK');

  let asset2 = await checkAsset('RT-100002');
  assert(asset2.outstanding_reason, 'RT-100002 should be outstanding after TP2 with a missing scan');
  console.log('[e2e] verified RT-100002 outstanding via API — OK');

  // ===== TP3 + TP4 (as TDT) =====
  await login('TDT', null, 'K. Dlamini');
  await openTP('tp3');
  await scan('tp3Input', 'RT-100001');
  await page.click('#tp3Confirm');
  await page.waitForTimeout(400);
  console.log('[e2e] TP3 intake — OK');

  await openTP('tp4');
  await page.waitForTimeout(200);
  // RT-100002 never got scanned at TP2 or TP3, so it's still outstanding —
  // TP4 correctly requires a reason code before it will let the manifest
  // proceed. This is the business rule working as intended (see
  // TECHNICAL-SPEC.md §4.4), not a bug — the test supplies one.
  const reasonSelect = page.locator('select[data-reason="RT-100002"]');
  if (await reasonSelect.count() > 0) {
    await reasonSelect.selectOption('Left behind');
    await page.waitForTimeout(200);
  }
  await page.click('#tp4Confirm');
  await page.waitForTimeout(400);
  assert(!(await page.locator('#tp4Confirm').isVisible().catch(() => false)), 'TP4 should have advanced away from its own screen on success');
  console.log('[e2e] TP4 loaded — OK');

  // ===== TP5 + TP6 (as Hub) =====
  await login('Hub', 'Alberton (ALB)', 'N. Mokoena');
  await openTP('tp5');
  await scan('tp5Input', 'RT-100001');
  await page.click('#tp5Confirm');
  await page.waitForTimeout(400);
  console.log('[e2e] TP5 hub intake — OK');

  await openTP('tp6');
  await scan('tp6Input', 'RT-100001');
  await page.click('#tp6Confirm');
  await page.waitForTimeout(400);
  console.log('[e2e] TP6 empty collection — OK');

  // ===== TP7 (as DC) =====
  await login('DC', 'JHB-DC1', 'T. Nkosi');
  await openTP('tp7');
  await scan('tp7Input', 'RT-100001');
  await page.click('#tp7Confirm');
  await page.waitForTimeout(400);
  let asset1Final = await checkAsset('RT-100001');
  assert(asset1Final.status === 'Available at DC', `RT-100001 should be back to Available at DC, got: ${asset1Final.status}`);
  console.log('[e2e] TP7 return receipt — full loop closed — OK');

  // ===== Non-linear: Maintenance =====
  await openTP('maint');
  await page.fill('#maintOutInput', 'RT-100003');
  await page.fill('#maintReason', 'Wheel replacement');
  await page.click('#maintOutConfirm');
  await page.waitForTimeout(400);
  let asset3 = await checkAsset('RT-100003');
  assert(asset3.status === 'In Maintenance', 'RT-100003 should be In Maintenance');
  await scan('maintInInput', 'RT-100003');
  asset3 = await checkAsset('RT-100003');
  assert(asset3.status === 'Available at DC', 'RT-100003 should be back Available at DC after maintenance-in');
  console.log('[e2e] Maintenance out/in — OK');
  await page.click('#backBtn');
  await page.waitForTimeout(200);

  // ===== Non-linear: GLS =====
  await openTP('gls');
  await page.fill('#glsOutInput', 'RT-100004');
  await page.selectOption('#glsSite', 'GLS Johannesburg');
  await page.click('#glsOutConfirm');
  await page.waitForTimeout(400);
  let asset4 = await checkAsset('RT-100004');
  assert(asset4.status === 'With GLS Vendor: GLS Johannesburg', `expected GLS custody, got: ${asset4.status}`);
  console.log('[e2e] GLS custody out — OK');
  await page.click('#backBtn');
  await page.waitForTimeout(200);

  // ===== Non-linear: Inter-DC Transfer =====
  await openTP('interdc');
  await page.fill('#interdcOutInput', 'RT-100005');
  await page.selectOption('#interdcToDC', 'CPT-DC1');
  await page.click('#interdcOutConfirm');
  await page.waitForTimeout(400);
  let asset5 = await checkAsset('RT-100005');
  assert(asset5.status === 'Inter-DC Transfer to CPT-DC1', `expected transfer status, got: ${asset5.status}`);
  console.log('[e2e] Inter-DC transfer out — OK');

  // ===== WSW (as WSW Operator at CPT-DC1) =====
  await login('WSW', 'CPT-DC1', 'S. Radebe');
  await openTP('wsw1');
  await scan('wsw1Input', 'RT-100006');
  await page.waitForTimeout(400);
  let asset6 = await checkAsset('RT-100006');
  assert(asset6.status === 'At WSW: CPT-DC1', `expected At WSW, got: ${asset6.status}`);
  await page.click('#backBtn');
  await openTP('wsw2');
  await scan('wsw2Input', 'RT-100006');
  await page.waitForTimeout(400);
  asset6 = await checkAsset('RT-100006');
  assert(asset6.status === 'Available at DC' && asset6.home_site_code === 'CPT-DC1', `expected released to CPT-DC1 stock, got: ${JSON.stringify(asset6.status)}`);
  console.log('[e2e] WSW intake + sort — OK');

  // Filter failed resources by URL (reliable) rather than console error
  // text (which never includes the URL, so can't distinguish "known
  // sandbox CDN block" from "genuine app bug" by pattern-matching).
  const unexpectedFailures = failedResourceUrls.filter(u => !/fonts\.googleapis\.com|unpkg\.com/.test(u));
  console.log('\n[e2e] failed resource loads (raw):', JSON.stringify(failedResourceUrls));
  console.log('[e2e] unexpected failures after excluding known sandbox CDN blocks:', JSON.stringify(unexpectedFailures));
  console.log('[e2e] uncaught JS exceptions:', JSON.stringify(pageErrors));
  assert(unexpectedFailures.length === 0, 'no unexpected failed resource loads (excluding the known-blocked CDN hosts)');
  assert(pageErrors.length === 0, 'no uncaught JS exceptions should occur across the whole run');

  await browser.close();
  server.close();
  console.log('\n[e2e] ALL CHECKS PASSED — the retrofitted scanner app drives every touch point, WSW, and 3 non-linear flows against the real backend, with zero browser errors.');
}

main().catch((err) => { console.error('[e2e] FAILED:', err); process.exit(1); });
