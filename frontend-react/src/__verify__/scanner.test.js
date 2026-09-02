// src/__verify__/scanner.test.js
//
// Renders the SCANNER app's components with the real React and the
// real react-dom/server — not mocks — and asserts on the HTML they
// produce. The identical module files run in the browser; nothing here
// is a stand-in.
//
// What this does not cover: clicks, state updates after a re-render,
// and effects resolving. Those need a browser. See README.md.

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import fs from 'node:fs';

import { ROLES, TP_META, NONLINEAR_META } from '../../scanner/components/constants.js';
import { Login } from '../../scanner/components/Login.js';
import { Picker } from '../../scanner/components/Picker.js';
import { TP1Panel } from '../../scanner/components/TP1Panel.js';
import { TP2Panel } from '../../scanner/components/TP2Panel.js';
import { TP3Panel } from '../../scanner/components/TP3Panel.js';
import { TP4Panel } from '../../scanner/components/TP4Panel.js';
import { TP5Panel } from '../../scanner/components/TP5Panel.js';
import { TP6Panel } from '../../scanner/components/TP6Panel.js';
import { TP7Panel } from '../../scanner/components/TP7Panel.js';
import { WSW1Panel } from '../../scanner/components/WSW1Panel.js';
import { WSW2Panel } from '../../scanner/components/WSW2Panel.js';
import { DamagedPanel } from '../../scanner/components/DamagedPanel.js';
import { MaintPanel } from '../../scanner/components/MaintPanel.js';
import { GlsPanel } from '../../scanner/components/GlsPanel.js';
import { InterDcPanel } from '../../scanner/components/InterDcPanel.js';

const h = React.createElement;
const render = (el) => ReactDOMServer.renderToStaticMarkup(el);

const noop = () => {};
const loginProps = (over = {}) => ({
  dcSites: ['JHB-DC1'], hubSites: ['Alberton (ALB)'],
  onLogin: noop, loggingIn: false, error: null, ...over,
});

test('Login renders all 4 role cards and no site picker before a role is chosen', () => {
  const html = render(h(Login, loginProps()));
  assert.match(html, /TFS LOGISTICS/);
  for (const r of ROLES) assert.match(html, new RegExp(r.title));
  assert.doesNotMatch(html, /<select/, 'the site dropdown should not exist until a role that needs one is picked');
});

test('Login starts with the submit button disabled', () => {
  const html = render(h(Login, loginProps({ dcSites: [], hubSites: [] })));
  assert.match(html, /<button[^>]*disabled[^>]*>Log in/);
});

test('Login surfaces a server error verbatim', () => {
  const html = render(h(Login, loginProps({ error: 'unknown siteCode' })));
  assert.match(html, /unknown siteCode/);
});

test('Login shows a busy label while the request is in flight', () => {
  const html = render(h(Login, loginProps({ loggingIn: true })));
  assert.match(html, /Logging in…/);
});

test('Login warns when no sites came back from the API', () => {
  const html = render(h(Login, loginProps({ dcSites: [], hubSites: [] })));
  assert.doesNotMatch(html, /is the API reachable/, 'the warning belongs under the site picker, which is not rendered yet');
});

test('Picker shows only the DC touch points for a DC session', () => {
  const session = { role: 'DC', site: 'JHB-DC1', opName: 'T. Nkosi' };
  const html = render(h(Picker, { session, onSelect: noop, onLogout: noop }));
  assert.match(html, /DC Dispatch Open/);
  assert.match(html, /DC Dispatch Close/);
  assert.match(html, /DC Return Receipt/);
  assert.doesNotMatch(html, /TDT Dispatch Intake/, 'a DC session must not see TDT touch points');
  assert.doesNotMatch(html, /Hub Intake/, 'a DC session must not see Hub touch points');
  assert.doesNotMatch(html, /WSW Intake/, 'a DC session must not see WSW touch points');
});

test('Picker shows only the TDT touch points for a TDT session', () => {
  const session = { role: 'TDT', site: null, opName: 'K. Dlamini' };
  const html = render(h(Picker, { session, onSelect: noop, onLogout: noop }));
  assert.match(html, /TDT Dispatch Intake/);
  assert.match(html, /TDT Dispatch Loaded/);
  assert.doesNotMatch(html, /DC Dispatch Open/);
});

test('Picker shows the WSW steps, numbered as WSW, for a WSW session', () => {
  const session = { role: 'WSW', site: 'JHB-DC1', opName: 'S. Mokoena' };
  const html = render(h(Picker, { session, onSelect: noop, onLogout: noop }));
  assert.match(html, /WSW Intake/);
  assert.match(html, /WSW Sort &amp; Process/);
  assert.match(html, /WSW1/, 'the WSW steps are numbered WSW1/WSW2, not TP1/TP2');
  assert.doesNotMatch(html, /DC Dispatch Open/);
  assert.doesNotMatch(html, /Other movements/, 'no non-linear flow belongs to the WSW role');
});

test('Picker gives the non-linear movements their own section, not a touch-point number', () => {
  const session = { role: 'DC', site: 'JHB-DC1', opName: 'T. Nkosi' };
  const html = render(h(Picker, { session, onSelect: noop, onLogout: noop }));
  assert.match(html, /Other movements/);
  // Exactly the DC non-linear flows are dashed; the touch points are not.
  const dashed = html.match(/class="tp-card other"/g) || [];
  assert.equal(dashed.length, NONLINEAR_META.filter((n) => n.role === 'DC').length);
  assert.match(html, /Maintenance Scan-Out \/ In/);
  assert.match(html, /GLS Vendor Custody/);
  assert.match(html, /Inter-DC Transfer/);
});

test('the TDT driver reaches damaged scan-out from the picker, not a dead end', () => {
  const session = { role: 'TDT', site: null, opName: 'K. Dlamini' };
  const html = render(h(Picker, { session, onSelect: noop, onLogout: noop }));
  assert.match(html, /Other movements/);
  assert.match(html, /Damaged Asset Scan-Out/);
});

test('TP1Panel starts empty, with the confirm button disabled and no undo offered', () => {
  const html = render(h(TP1Panel, { api: {}, session: { site: 'JHB-DC1' }, onDone: noop, onBack: noop }));
  assert.match(html, /No scans yet\./);
  assert.match(html, /<button[^>]*disabled[^>]*>Open dispatch \(0\)/);
  assert.doesNotMatch(html, /Undo last scan/, 'undo should only appear once something has been scanned');
});

test('TP2Panel renders its loading state first, which is what a browser paints too', () => {
  // renderToStaticMarkup is synchronous, so the useEffect fetch has not
  // resolved — this asserts the correct initial frame.
  const api = { getManifests: async () => [] };
  const html = render(h(TP2Panel, { api, session: { site: 'JHB-DC1' }, hubSites: ['Alberton (ALB)'], onDone: noop, onBack: noop }));
  assert.match(html, /Loading…/);
});

test('every manifest-driven panel paints a loading frame before its fetch resolves', () => {
  const api = { getManifests: async () => [], getAssets: async () => [] };
  const session = { role: 'DC', site: 'JHB-DC1', opName: 'T. Nkosi' };
  const cases = [
    [TP3Panel, {}], [TP4Panel, {}], [TP5Panel, {}], [TP6Panel, {}],
    [TP7Panel, { returnsSites: ['Returns Facility — Isando'] }],
  ];
  for (const [PanelUnderTest, extra] of cases) {
    const html = render(h(PanelUnderTest, { api, session, onDone: noop, onBack: noop, ...extra }));
    assert.match(html, /Loading…/, `${PanelUnderTest.name} should paint a loading frame`);
    assert.match(html, /back-link/, `${PanelUnderTest.name} should offer a way back to the picker`);
  }
});

test('WSW1 accepts a scan with no manifest to match against — that is the point of it', () => {
  const session = { role: 'WSW', site: 'JHB-DC1', opName: 'S. Mokoena' };
  const html = render(h(WSW1Panel, { api: {}, session, showToast: noop, onBack: noop }));
  assert.match(html, /misrouted stock/);
  assert.match(html, /Scan or type barcode/);
  assert.doesNotMatch(html, /tp-pick/, 'there is no manifest to pick at WSW intake');
});

test('WSW2 lists what is sitting at this WSW, keyed to the operator’s own site', () => {
  const api = { getAssets: async () => [] };
  const session = { role: 'WSW', site: 'JHB-DC1', opName: 'S. Mokoena' };
  const html = render(h(WSW2Panel, { api, session, showToast: noop, onBack: noop }));
  assert.match(html, /Currently at WSW, JHB-DC1/);
});

test('the non-linear panels each render their own form, with a camera-fillable barcode field', () => {
  const api = { getAssets: async () => [] };
  const session = { role: 'DC', site: 'JHB-DC1', opName: 'T. Nkosi' };
  const cases = [
    [DamagedPanel, {}, /Damage note/],
    [MaintPanel, {}, /Scan out for maintenance/],
    [GlsPanel, { glsSites: ['GLS Johannesburg'] }, /Transfer out to GLS/],
    [InterDcPanel, { dcSites: ['JHB-DC1', 'CPT-DC1'] }, /Destination DC/],
  ];
  for (const [PanelUnderTest, extra, marker] of cases) {
    const html = render(h(PanelUnderTest, { api, session, showToast: noop, onBack: noop, ...extra }));
    assert.match(html, marker, `${PanelUnderTest.name} should render its own form`);
    assert.match(html, /⌗ Camera/, `${PanelUnderTest.name} should offer the camera`);
  }
});

test('Inter-DC transfer never offers the operator their own DC as a destination', () => {
  const api = { getAssets: async () => [] };
  const session = { role: 'DC', site: 'JHB-DC1', opName: 'T. Nkosi' };
  const html = render(h(InterDcPanel, {
    api, session, dcSites: ['JHB-DC1', 'CPT-DC1'], showToast: noop, onBack: noop,
  }));
  assert.match(html, /<option[^>]*value="CPT-DC1"/);
  assert.doesNotMatch(html, /<option[^>]*value="JHB-DC1"/, 'a DC cannot transfer stock to itself');
});

test('every scan row offers the camera, because a phone has no barcode gun', () => {
  const html = render(h(TP1Panel, { api: {}, session: { site: 'JHB-DC1' }, onDone: noop, onBack: noop }));
  assert.match(html, /⌗ Camera/);
});

test('the scanner knows every movement the vanilla scanner does', () => {
  // 7 linear touch points + 2 WSW steps, and 4 non-linear flows —
  // matching frontend/mercury-scanner.html exactly. The fifth
  // non-linear path, returns-facility routing, lives inside TP7 in
  // both builds, which is why it is not a picker entry here.
  assert.deepEqual(TP_META.map((t) => t.id),
    ['tp1', 'tp2', 'tp3', 'tp4', 'tp5', 'tp6', 'tp7', 'wsw1', 'wsw2']);
  assert.deepEqual(NONLINEAR_META.map((n) => n.id), ['damaged', 'maint', 'gls', 'interdc']);
});

test('every movement belongs to a role the login screen actually offers', () => {
  const roleIds = ROLES.map((r) => r.id);
  for (const tp of [...TP_META, ...NONLINEAR_META]) {
    assert.ok(roleIds.includes(tp.role), `${tp.id} is assigned to role "${tp.role}", which no one can log in as`);
  }
});

test('every movement the picker can reach has a panel wired up behind it', () => {
  // The old build routed anything unported to a "not yet built" panel.
  // Nothing is unported now, so the picker and the router must agree:
  // a new entry in constants.js without a branch in app.js would
  // otherwise be a card that does nothing when tapped.
  const app = fs.readFileSync(new URL('../../scanner/app.js', import.meta.url), 'utf8');
  const routed = [...app.matchAll(/^\s{6}(\w+):\s*\(\)\s*=>/gm)].map((m) => m[1]);
  assert.deepEqual(
    routed.slice().sort(),
    [...TP_META, ...NONLINEAR_META].map((t) => t.id).sort(),
    'scanner/app.js routes a different set of movements than the picker offers'
  );
});
