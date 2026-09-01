// e2e/full-stack.spec.js
//
// Proves the backend and frontend actually work together: starts a real
// backend server on an ephemeral port, opens the reference integration
// page against it in a real browser, and drives the exact TP1 -> TP2
// flow through the UI — not calling the API directly, clicking the
// same buttons an operator would.
//
// Run with: node e2e/full-stack.spec.js  (plain script, not a test
// runner — see note at the bottom on why, given this environment's
// constraints).

const path = require('node:path');
const { chromium } = require('playwright');

async function main() {
  process.env.DB_PATH = ':memory:';
  process.env.PORT = '0';
  const app = require(path.join(__dirname, '..', 'backend', 'src', 'server.js'));
  const db = require(path.join(__dirname, '..', 'backend', 'src', 'db.js'));

  db.run(`INSERT INTO sites (code, name, type) VALUES ('JHB-DC1','JHB-DC1','DC')`);
  db.run(`INSERT INTO sites (code, name, type) VALUES ('Alberton (ALB)','Alberton','Hub')`);
  db.run(`INSERT INTO assets (id, type, home_site_code, status, stage, registered_at) VALUES ('RT-100001','Rolltainer','JHB-DC1','Available at DC',0,datetime('now'))`);
  db.run(`INSERT INTO assets (id, type, home_site_code, status, stage, registered_at) VALUES ('RT-100002','Rolltainer','JHB-DC1','Available at DC',0,datetime('now'))`);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const apiPort = server.address().port;
  console.log(`[e2e] backend listening on :${apiPort}`);

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

  await page.addInitScript((port) => { window.TFS_API_BASE_URL = `http://localhost:${port}`; }, apiPort);
  const filePath = 'file://' + path.join(__dirname, '..', 'frontend', 'reference-integration.html');
  await page.goto(filePath);

  await page.click('#loginBtn');
  await page.waitForTimeout(300);
  const statusText = await page.locator('#status').textContent();
  assert(statusText.includes('Logged in'), `expected logged-in status, got: ${statusText}`);

  await page.click('#tp1Btn');
  await page.waitForTimeout(300);
  const tp1Text = await page.locator('#tp1Result').textContent();
  assert(tp1Text.includes('manifest: MAN-'), `expected a manifest ID, got: ${tp1Text}`);
  console.log('[e2e] TP1 result:', tp1Text.trim());

  await page.click('#tp2Btn');
  await page.waitForTimeout(300);
  const tp2Text = await page.locator('#tp2Result').textContent();
  assert(tp2Text.includes('RT-100002'), `expected RT-100002 flagged missing (only RT-100001 was scanned), got: ${tp2Text}`);
  console.log('[e2e] TP2 result:', tp2Text.trim());

  await page.click('#dashBtn');
  await page.waitForTimeout(300);
  const dashText = await page.locator('#dashResult').textContent();
  const dash = JSON.parse(dashText);
  assert(dash.rollups.Outstanding >= 1, 'expected RT-100002 to show up as Outstanding on the dashboard');
  console.log('[e2e] dashboard rollups:', JSON.stringify(dash.rollups));

  await browser.close();
  server.close();
  console.log('\n[e2e] ALL ASSERTIONS PASSED — frontend UI -> real backend -> real database -> dashboard, verified end to end.');
}

function assert(cond, msg) {
  if (!cond) throw new Error('E2E ASSERTION FAILED: ' + msg);
}

main().catch((err) => {
  console.error('[e2e] FAILED:', err);
  process.exit(1);
});
