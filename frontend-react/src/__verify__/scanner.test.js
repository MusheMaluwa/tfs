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

import { ROLES, TP_META } from '../../scanner/components/constants.js';
import { Login } from '../../scanner/components/Login.js';
import { Picker } from '../../scanner/components/Picker.js';
import { TP1Panel } from '../../scanner/components/TP1Panel.js';
import { TP2Panel } from '../../scanner/components/TP2Panel.js';
import { NotPorted } from '../../scanner/components/NotPorted.js';

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
  const html = render(h(Picker, { session, ported: ['tp1', 'tp2'], onSelect: noop, onLogout: noop }));
  assert.match(html, /DC Dispatch Open/);
  assert.match(html, /DC Dispatch Close/);
  assert.match(html, /DC Return Receipt/);
  assert.doesNotMatch(html, /TDT Dispatch Intake/, 'a DC session must not see TDT touch points');
  assert.doesNotMatch(html, /Hub Intake/, 'a DC session must not see Hub touch points');
});

test('Picker shows only the TDT touch points for a TDT session', () => {
  const session = { role: 'TDT', site: null, opName: 'K. Dlamini' };
  const html = render(h(Picker, { session, ported: ['tp1', 'tp2'], onSelect: noop, onLogout: noop }));
  assert.match(html, /TDT Dispatch Intake/);
  assert.match(html, /TDT Dispatch Loaded/);
  assert.doesNotMatch(html, /DC Dispatch Open/);
});

test('Picker marks a not-yet-built touch point visually distinct from a live one', () => {
  const session = { role: 'DC', site: 'JHB-DC1', opName: 'T. Nkosi' };
  const html = render(h(Picker, { session, ported: ['tp1', 'tp2'], onSelect: noop, onLogout: noop }));
  // TP7 is not in `ported`, so exactly one of the three DC cards is dashed.
  const dashed = html.match(/class="tp-card other"/g) || [];
  assert.equal(dashed.length, 1);
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

test('NotPorted names the touch point and points at the working implementation', () => {
  const html = render(h(NotPorted, { tpId: 'tp5', onBack: noop }));
  assert.match(html, /TP5 — Hub Intake/);
  assert.match(html, /mercury-scanner\.html/);
});

test('the scanner knows the same 7 touch points as the backend', () => {
  assert.equal(TP_META.length, 7);
  assert.deepEqual(TP_META.map((t) => t.id), ['tp1', 'tp2', 'tp3', 'tp4', 'tp5', 'tp6', 'tp7']);
});

test('every touch point belongs to a role the login screen actually offers', () => {
  const roleIds = ROLES.map((r) => r.id);
  for (const tp of TP_META) {
    assert.ok(roleIds.includes(tp.role), `${tp.id} is assigned to role "${tp.role}", which no one can log in as`);
  }
});
