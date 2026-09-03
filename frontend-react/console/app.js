// console/app.js — root of the CONSOLE app.
//
// A completely separate React root from scanner/app.js. They share the
// backend (shared/api.js), the palette (shared/tokens.css) and the
// toast — nothing else. This page is desktop back-office: tables,
// filters, a map, CSV exports. None of that code is ever shipped to an
// operator's phone, and none of the scanner's code is shipped here.
//
// NO SIGN-IN. Open the page and everything is there, exactly like the
// original frontend/mercury-console.html. The API does require a token
// on its read endpoints, so this authenticates itself on load and keeps
// the token in memory — the manager never sees it. That is not a
// security hole being opened: the backend already issues a token to any
// name it is given without verifying identity, which is documented as
// the one SSO gap to close before real inventory (see
// backend/src/routes/auth.js). When real auth lands, this is the one
// function that changes.
//
// All state comes from the API. The old localStorage-backed prototype
// kept a seeded copy of the fleet in the browser, which meant two
// managers on two machines saw different numbers; every figure on this
// page is server-side truth.

import React from 'react';
import { createRoot } from 'react-dom/client';

// ---------------------------------------------------------------------
// RUNNING ON LOCAL DEMO DATA — the MongoDB backend is switched off.
//
// The line below is the live API client: it talks HTTP to the Node/
// MongoDB service in ../backend. Nothing has been deleted —
// shared/api.js is untouched and the backend still builds and runs.
// It is commented out only because the API is not up right now.
//
// import { createApi } from '../shared/api.js';
//
// shared/data.js takes its place: the same `createApi` surface, served
// from the hardcoded fleet in that file and kept in localStorage, so
// the scanner app and this one still see the same data.
//
// TO GO BACK TO MONGODB: start the API (cd ../backend && npm run dev),
// then swap the two import lines back.
// ---------------------------------------------------------------------
import { createApi } from '../shared/data.js';

import { Toast, useToast } from '../shared/Toast.js';
import { Dashboard } from './components/Dashboard.js';
import { Registry } from './components/Registry.js';
import { AssetModal } from './components/AssetModal.js';
import { ProcessReference } from './components/ProcessReference.js';
import { REFRESH_MS } from './components/constants.js';

const h = React.createElement;

const API_BASE_URL = window.TFS_API_BASE_URL || 'http://localhost:4000';

// 'DC' because registering assets and onboarding sites are DC-role
// endpoints; the console needs to be able to do both.
const CONSOLE_OPERATOR = 'TFS Console';
const CONSOLE_ROLE = 'DC';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'registry', label: 'Asset Registry' },
];

const EMPTY = { summary: null, assets: [], exceptions: [], manifests: [], sites: [] };

function App() {
  const [token, setToken] = React.useState(null);
  const [tab, setTab] = React.useState('dashboard');
  const [data, setData] = React.useState(EMPTY);
  const [err, setErr] = React.useState(null);
  const [lastUpdated, setLastUpdated] = React.useState('—');
  const [openAsset, setOpenAsset] = React.useState(null);
  const [toast, showToast] = useToast();

  const api = React.useMemo(() => createApi(API_BASE_URL, () => token), [token]);

  // Authenticate on load, invisibly. Held in memory only — there is no
  // session to persist when there is no sign-in.
  React.useEffect(() => {
    let cancelled = false;
    createApi(API_BASE_URL, () => null)
      .login(CONSOLE_OPERATOR, CONSOLE_ROLE)
      .then((res) => { if (!cancelled) setToken(res.token); })
      .catch((e) => { if (!cancelled) setErr('Could not reach the API: ' + e.message); });
    return () => { cancelled = true; };
  }, []);

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
      setErr(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setErr('Could not load from the API: ' + e.message);
    }
  }, [api, token]);

  React.useEffect(() => { refresh(); }, [refresh]);

  React.useEffect(() => {
    if (!token) return undefined;
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, token]);

  return h(React.Fragment, null,
    h('header', { className: 'top' },
      h('div', { className: 'brand' },
        h('div', { className: 'mark' }, 'TFS'),
        h('div', null,
          h('h1', null, 'TFS LOGISTICS'),
          h('div', { className: 'sub' }, 'Dashboard & Asset Registry')))
    ),

    h('nav', { className: 'tabs' },
      TABS.map((t) => h('button', {
        type: 'button', key: t.id,
        className: tab === t.id ? 'active' : '',
        'aria-current': tab === t.id ? 'page' : undefined,
        onClick: () => setTab(t.id),
      }, t.label))
    ),

    err && h('div', { className: 'alert warn' }, err),

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
