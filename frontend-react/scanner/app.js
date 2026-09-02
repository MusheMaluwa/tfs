// scanner/app.js — root of the SCANNER app.
//
// This is a completely separate React root from console/app.js. The two
// apps share the backend (shared/api.js) and the palette
// (shared/tokens.css) and nothing else: no shared router, no shared
// bundle, no shared state. An operator's phone never downloads the
// console's map or table code, and a change to one app cannot break the
// other.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { createApi } from '../shared/api.js';
import { Toast, useToast } from '../shared/Toast.js';
import { Login } from './components/Login.js';
import { Picker } from './components/Picker.js';
import { TP1Panel } from './components/TP1Panel.js';
import { TP2Panel } from './components/TP2Panel.js';
import { NotPorted } from './components/NotPorted.js';

const h = React.createElement;

const API_BASE_URL = window.TFS_API_BASE_URL || 'http://localhost:4000';
const TOKEN_KEY = 'tfs_scanner_token';
const SESSION_KEY = 'tfs_scanner_session';

// Touch points implemented in this React app. Everything else routes to
// NotPorted — add the id here when you add its panel below.
const PORTED = ['tp1', 'tp2'];

function App() {
  const [token, setToken] = React.useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [session, setSession] = React.useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
  });
  const [loggingIn, setLoggingIn] = React.useState(false);
  const [loginError, setLoginError] = React.useState(null);
  const [activeTP, setActiveTP] = React.useState(null);
  const [sites, setSites] = React.useState({ dc: [], hub: [] });
  const [toast, showToast] = useToast();

  const api = React.useMemo(() => createApi(API_BASE_URL, () => token), [token]);

  // Site lists come from the API, not a hardcoded array — a site added
  // in the console appears here on the next load. GET /api/sites is
  // public precisely so this can run before login.
  React.useEffect(() => {
    let cancelled = false;
    api.getSites()
      .then((rows) => {
        if (cancelled) return;
        setSites({
          dc: rows.filter((s) => s.type === 'DC').map((s) => s.code),
          hub: rows.filter((s) => s.type === 'Hub').map((s) => s.code),
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
    body = h(Picker, { session, ported: PORTED, onSelect: setActiveTP, onLogout: handleLogout });
  } else if (activeTP === 'tp1') {
    body = h(TP1Panel, { api, session, onDone: handleDone, onBack: back });
  } else if (activeTP === 'tp2') {
    body = h(TP2Panel, { api, session, hubSites: sites.hub, onDone: handleDone, onBack: back });
  } else {
    body = h(NotPorted, { tpId: activeTP, onBack: back });
  }

  return h(React.Fragment, null, body, h(Toast, { toast }));
}

createRoot(document.getElementById('root')).render(h(App));
