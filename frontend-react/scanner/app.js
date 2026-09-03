// scanner/app.js — root of the SCANNER app.
//
// This is a completely separate React root from console/app.js. The two
// apps share the backend (shared/api.js), the palette
// (shared/tokens.css), the toast and the camera component — and nothing
// else: no shared router, no shared bundle, no shared state. An
// operator's phone never downloads the console's map or table code, and
// a change to one app cannot break the other.
//
// Every movement the vanilla frontend/mercury-scanner.html can perform
// is here: the seven touch points, both WSW steps, and the four
// non-linear flows. Returns-facility routing is the fifth non-linear
// path and lives inside TP7, exactly as it does there.

import React from 'react';
import { createRoot } from 'react-dom/client';

// ---------------------------------------------------------------------
// RUNNING ON LOCAL DEMO DATA — the MongoDB backend is switched off.
//
// The line below is the live API client: it talks HTTP to the Node/
// MongoDB service in ../backend. Nothing about it has been deleted —
// shared/api.js is untouched and the backend still builds and runs.
// It is commented out only because the API is not up right now, which
// is what produced ERR_CONNECTION_REFUSED on localhost:4000.
//
// import { createApi } from '../shared/api.js';
//
// In its place, shared/data.js serves the hardcoded fleet and applies
// the same touch-point rules in the browser. It exports `createApi`
// with an identical signature, so no component below changes.
//
// TO GO BACK TO MONGODB: start the API (cd ../backend && npm run dev),
// then swap the two import lines back.
// ---------------------------------------------------------------------
import { createApi } from '../shared/data.js';

import { Toast, useToast } from '../shared/Toast.js';
import { Login } from './components/Login.js';
import { Picker } from './components/Picker.js';
import { TP1Panel } from './components/TP1Panel.js';
import { TP2Panel } from './components/TP2Panel.js';
import { TP3Panel } from './components/TP3Panel.js';
import { TP4Panel } from './components/TP4Panel.js';
import { TP5Panel } from './components/TP5Panel.js';
import { TP6Panel } from './components/TP6Panel.js';
import { TP7Panel } from './components/TP7Panel.js';
import { WSW1Panel } from './components/WSW1Panel.js';
import { WSW2Panel } from './components/WSW2Panel.js';
import { DamagedPanel } from './components/DamagedPanel.js';
import { MaintPanel } from './components/MaintPanel.js';
import { GlsPanel } from './components/GlsPanel.js';
import { InterDcPanel } from './components/InterDcPanel.js';

const h = React.createElement;

const API_BASE_URL = window.TFS_API_BASE_URL || 'http://localhost:4000';
const TOKEN_KEY = 'tfs_scanner_token';
const SESSION_KEY = 'tfs_scanner_session';

const EMPTY_SITES = { dc: [], hub: [], returns: [], gls: [] };

function App() {
  const [token, setToken] = React.useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [session, setSession] = React.useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
  });
  const [loggingIn, setLoggingIn] = React.useState(false);
  const [loginError, setLoginError] = React.useState(null);
  const [activeTP, setActiveTP] = React.useState(null);
  const [sites, setSites] = React.useState(EMPTY_SITES);
  const [toast, showToast] = useToast();

  const api = React.useMemo(() => createApi(API_BASE_URL, () => token), [token]);

  // Site lists come from the API, not a hardcoded array — a site added
  // in the console appears here on the next load. GET /api/sites is
  // public precisely so this can run before login. All four types are
  // read: DCs and Hubs for login and dispatch, Returns for TP7's
  // non-standard routing, GLS for vendor custody.
  React.useEffect(() => {
    let cancelled = false;
    const codes = (rows, type) => rows.filter((s) => s.type === type).map((s) => s.code);
    api.getSites()
      .then((rows) => {
        if (cancelled) return;
        setSites({
          dc: codes(rows, 'DC'),
          hub: codes(rows, 'Hub'),
          returns: codes(rows, 'Returns'),
          gls: codes(rows, 'GLS'),
        });
      })
      .catch(() => { if (!cancelled) showToast('Could not reach the API — check it is running.', true); });
    return () => { cancelled = true; };
  }, [api, showToast]);

  const handleLogin = React.useCallback(async (role, site, opName) => {
    setLoggingIn(true); setLoginError(null);
    try {
      const data = await api.login(opName, role, site);
      const next = { role, site, opName };
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setToken(data.token);
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
    setToken(null); setSession(null); setActiveTP(null);
  }, []);

  // A touch point that commits one manifest in one submit reports
  // through onDone, which toasts and returns to the picker. The
  // scan-at-a-time flows (WSW, the non-linear ones) stay open and
  // toast directly instead — an operator working a pile shouldn't be
  // bounced back to the menu after every asset.
  const handleDone = React.useCallback((msg) => {
    showToast(msg);
    setActiveTP(null);
  }, [showToast]);

  const back = React.useCallback(() => setActiveTP(null), []);

  let body;
  if (!session || !token) {
    body = h(Login, {
      dcSites: sites.dc, hubSites: sites.hub,
      onLogin: handleLogin, loggingIn, error: loginError,
    });
  } else if (!activeTP) {
    body = h(Picker, { session, onSelect: setActiveTP, onLogout: handleLogout });
  } else {
    const common = { api, session, onBack: back };
    const panels = {
      tp1: () => h(TP1Panel, { ...common, onDone: handleDone }),
      tp2: () => h(TP2Panel, { ...common, hubSites: sites.hub, onDone: handleDone }),
      tp3: () => h(TP3Panel, { ...common, onDone: handleDone }),
      tp4: () => h(TP4Panel, { ...common, onDone: handleDone }),
      tp5: () => h(TP5Panel, { ...common, onDone: handleDone }),
      tp6: () => h(TP6Panel, { ...common, onDone: handleDone }),
      tp7: () => h(TP7Panel, { ...common, returnsSites: sites.returns, onDone: handleDone }),
      wsw1: () => h(WSW1Panel, { ...common, showToast }),
      wsw2: () => h(WSW2Panel, { ...common, showToast }),
      damaged: () => h(DamagedPanel, { ...common, showToast }),
      maint: () => h(MaintPanel, { ...common, showToast }),
      gls: () => h(GlsPanel, { ...common, glsSites: sites.gls, showToast }),
      interdc: () => h(InterDcPanel, { ...common, dcSites: sites.dc, showToast }),
    };
    body = panels[activeTP] ? panels[activeTP]() : h(Picker, { session, onSelect: setActiveTP, onLogout: handleLogout });
  }

  return h(React.Fragment, null, body, h(Toast, { toast }));
}

createRoot(document.getElementById('root')).render(h(App));
