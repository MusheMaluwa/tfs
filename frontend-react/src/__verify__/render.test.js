// src/__verify__/render.test.js
//
// These tests import the REAL React and REAL react-dom/server (not
// mocks) and actually render the components from components.js,
// asserting on the resulting HTML. This is genuine verification that
// the components produce correct output for a given set of props/state
// — not a build check, not a syntax check, an actual render.
//
// What this does NOT cover: interactivity (clicks, state updates after
// a re-render, effects firing) — that needs a browser. See
// frontend-react/README.md for exactly what is and isn't verified here
// and why.

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { makeComponents } from '../../components.js';

const { Login, Picker, TP1Panel, TP2Panel } = makeComponents(React);
const h = React.createElement;
const render = (el) => ReactDOMServer.renderToStaticMarkup(el);

test('Login renders all 4 role cards and no site field before a role is picked', () => {
  const html = render(h(Login, { dcSites: ['JHB-DC1'], hubSites: ['Alberton (ALB)'], onLogin: () => {}, loggingIn: false, error: null }));
  assert.match(html, /TFS LOGISTICS/);
  assert.match(html, /DC Operator/);
  assert.match(html, /TDT Driver/);
  assert.match(html, /Hub Operator/);
  assert.match(html, /WSW Operator/);
  assert.doesNotMatch(html, /<select/, 'site dropdown should not render until a role needing one is selected');
});

test('Login disables the submit button when required fields are missing', () => {
  const html = render(h(Login, { dcSites: [], hubSites: [], onLogin: () => {}, loggingIn: false, error: null }));
  assert.match(html, /<button[^>]*disabled[^>]*>Log in/, 'button should start disabled with no role selected');
});

test('Login shows an error message when one is passed', () => {
  const html = render(h(Login, { dcSites: [], hubSites: [], onLogin: () => {}, loggingIn: false, error: 'Login failed: unknown siteCode' }));
  assert.match(html, /Login failed: unknown siteCode/);
});

test('Login shows "Logging in…" while loggingIn is true', () => {
  const html = render(h(Login, { dcSites: [], hubSites: [], onLogin: () => {}, loggingIn: true, error: null }));
  assert.match(html, /Logging in…/);
});

test('Picker renders only the touch points belonging to the session role (DC)', () => {
  const session = { role: 'DC', site: 'JHB-DC1', opName: 'T. Nkosi' };
  const html = render(h(Picker, { session, onSelect: () => {}, onLogout: () => {} }));
  assert.match(html, /DC Dispatch Open/);
  assert.match(html, /DC Dispatch Close/);
  assert.match(html, /DC Return Receipt/);
  assert.doesNotMatch(html, /TDT Dispatch Intake/, 'a DC session should not see TDT touch points');
  assert.doesNotMatch(html, /Hub Intake/, 'a DC session should not see Hub touch points');
});

test('Picker renders only TDT touch points for a TDT session', () => {
  const session = { role: 'TDT', site: null, opName: 'K. Dlamini' };
  const html = render(h(Picker, { session, onSelect: () => {}, onLogout: () => {} }));
  assert.match(html, /TDT Dispatch Intake/);
  assert.match(html, /TDT Dispatch Loaded/);
  assert.doesNotMatch(html, /DC Dispatch Open/);
});

test('TP1Panel starts with an empty scan list and a disabled confirm button', () => {
  const html = render(h(TP1Panel, { api: {}, session: { site: 'JHB-DC1' }, onDone: () => {}, onBack: () => {} }));
  assert.match(html, /No scans yet\./);
  assert.match(html, /<button[^>]*disabled[^>]*>Open dispatch \(0\)/);
});

test('TP2Panel shows a loading state before manifests resolve, matching component initial state', () => {
  // renderToStaticMarkup is synchronous and won't wait for the useEffect's
  // async fetch, so this asserts the correct *initial* render — exactly
  // what a real browser would paint first too, before the effect resolves.
  const api = { getManifests: async () => [] };
  const html = render(h(TP2Panel, { api, session: { site: 'JHB-DC1' }, hubSites: ['Alberton (ALB)'], onDone: () => {}, onBack: () => {} }));
  assert.match(html, /Loading…/);
});

test('makeComponents exposes the same 7 touch points as the backend and vanilla frontend', () => {
  const { TP_META } = makeComponents(React);
  assert.equal(TP_META.length, 7);
  assert.deepEqual(TP_META.map(t => t.id), ['tp1', 'tp2', 'tp3', 'tp4', 'tp5', 'tp6', 'tp7']);
});
