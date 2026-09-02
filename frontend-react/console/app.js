// console/app.js — root of the CONSOLE app.
//
// A completely separate React root from scanner/app.js. They share the
// backend (shared/api.js), the palette (shared/tokens.css) and the
// toast — nothing else. This page is desktop back-office: tables,
// filters, a map, CSV exports. None of that code is ever shipped to an
// operator's phone, and none of the scanner's code is shipped here.
//
// All state comes from the API. The old localStorage-backed prototype
// (frontend/mercury-console.html) kept a seeded copy of the fleet in
// the browser, which meant two managers on two machines saw different
// numbers; every figure on this page is now server-side truth.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { createApi } from '../shared/api.js';
import { Toast, useToast } from '../shared/Toast.js';
import { Login } from './components/Login.js';
import { Dashboard } from './components/Dashboard.js';
import { Registry } from './components/Registry.js';
import { AssetModal } from './components/AssetModal.js';
import { ProcessReference } from './components/ProcessReference.js';
import { REFRESH_MS } from './components/constants.js';

const h = React.createElement;

const API_BASE_URL = window.TFS_API_BASE_URL || 'http://localhost:4000';
const TOKEN_KEY = 'tfs_console_token';
const SESSION_KEY = 'tfs_console_session';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'registry', label: 'Asset Registry' },
];

const EMPTY = { summary: null, assets: [], exceptions: [], manifests: [], sites: [] };

function App() {
  const [token, setToken] = React.useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [session, setSession] = React.useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
  });
  const [loggingIn, setLoggingIn] = React.useState(false);
  const [loginError, setLoginError] = React.useState(null);

  const [tab, setTab] = React.useState('dashboard');
  const [data, setData] = React.useState(EMPTY);
  const [loadErr, setLoadErr] = React.useState(null);
  const [lastUpdated, setLastUpdated] = React.useState('—');
  const [openAsset, setOpenAsset] = React.useState(null);
  const [dcSites, setDcSites] = React.useState([]);
  const [toast, showToast] = useToast();

  const api = React.useMemo(() => createApi(API_BASE_URL, () => token), [token]);

  // The login screen needs the DC list before a token exists, which is
  // exactly why GET /api/sites is public.
  React.useEffect(() => {
    api.getSites('DC')
      .then((rows) => setDcSites(rows.map((s) => s.code)))
      .catch(() => { /* the login screen says so; no toast before sign-in */ });
  }, [api]);

  /** One refresh of everything this page shows. Returns a promise so
   *  writes can await it and see their own change land. */
  const refresh = React.useCallback(async () => {
    if (!token) return;
    try {
      const [summary, assets, exceptions, manifests, sites] = await Promise.all([
        api.getDashboardSummary(),
        api.getAssets(),
        api.getExceptions(50),
        api.getManifests(),
        api.getSites(),
      ]);
      setData({ summary, assets, exceptions, manifests, sites });
      setLoadErr(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setLoadErr(e.message);
    }
  }, [api, token]);

  React.useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh. Cleared on unmount and re-created whenever refresh
  // changes identity, so a logout can't leave a timer polling with a
  // stale token.
  React.useEffect(() => {
    if (!token) return undefined;
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, token]);

  const handleLogin = React.useCallback(async (name, site) => {
    setLoggingIn(true); setLoginError(null);
    try {
      // 'DC' because registering assets and onboarding sites are
      // DC-role endpoints; a read-only viewer would use 'Viewer'.
      const res = await api.login(name, 'DC', site);
      const next = { name, site };
      sessionStorage.setItem(TOKEN_KEY, res.token);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setToken(res.token);
      setSession(next);
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setLoggingIn(false);
    }
  }, [api]);

  const handleLogout = React.useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setToken(null); setSession(null); setData(EMPTY);
  }, []);

  if (!token || !session) {
    return h(React.Fragment, null,
      h(Login, { dcSites, onLogin: handleLogin, loggingIn, error: loginError }),
      h(Toast, { toast }));
  }

  return h(React.Fragment, null,
    h('header', { className: 'top' },
      h('div', { className: 'brand' },
        h('div', { className: 'mark' }, 'TFS'),
        h('div', null,
          h('h1', null, 'TFS LOGISTICS'),
          h('div', { className: 'sub' }, 'Dashboard & Asset Registry'))),
      h('div', { className: 'session-tag' },
        h('span', null, h('b', null, session.name), session.site ? ' · ' + session.site : ''),
        h('button', { type: 'button', onClick: handleLogout }, 'Sign out'))
    ),

    h('nav', { className: 'tabs' },
      TABS.map((t) => h('button', {
        type: 'button', key: t.id,
        className: tab === t.id ? 'active' : '',
        'aria-current': tab === t.id ? 'page' : undefined,
        onClick: () => setTab(t.id),
      }, t.label))
    ),

    loadErr && h('div', { className: 'alert warn' }, 'Could not load from the API: ' + loadErr),

    tab === 'dashboard'
      ? h(React.Fragment, null,
          h(Dashboard, { data, lastUpdated, onAssetClick: setOpenAsset, showToast }),
          h(ProcessReference))
      : h(Registry, { api, data, onAssetClick: setOpenAsset, onChanged: refresh, showToast }),

    h('footer', null, 'TFS LOGISTICS — BACK-OFFICE VIEW — SCANNING HAPPENS IN THE TFS LOGISTICS SCANNER APP'),

    openAsset && h(AssetModal, { api, assetId: openAsset, onClose: () => setOpenAsset(null) }),
    h(Toast, { toast })
  );
}

createRoot(document.getElementById('root')).render(h(App));
