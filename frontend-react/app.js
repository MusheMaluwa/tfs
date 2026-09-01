// app.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import { makeComponents } from './components.js';
import { createApi } from './api.js';

const API_BASE_URL = window.TFS_API_BASE_URL || 'http://localhost:4000';
const DC_SITES = ['JHB-DC1', 'JHB-DC3', 'CPT-DC1', 'CPT-DC3', 'DBN-DC1'];
const HUB_SITES = ['Alberton (ALB)', 'Bryanston (BRY)', 'George (GEO)', 'Bloemfontein (BLO)'];

const { useState, useCallback } = React;
const h = React.createElement;
const { Login, Picker, TP1Panel, TP2Panel } = makeComponents(React);

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('tfs_token'));
  const [session, setSession] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [activeTP, setActiveTP] = useState(null);
  const [toast, setToast] = useState(null);

  const api = React.useMemo(() => createApi(API_BASE_URL, () => token), [token]);

  const handleLogin = useCallback(async (role, site, name) => {
    setLoggingIn(true); setLoginError(null);
    try {
      const data = await api.login(name, role, site);
      sessionStorage.setItem('tfs_token', data.token);
      setToken(data.token);
      setSession({ role, site: site || 'TDT Fleet', opName: name });
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setLoggingIn(false);
    }
  }, [api]);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('tfs_token');
    setToken(null); setSession(null); setActiveTP(null);
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const handleDone = useCallback((msg) => { showToast(msg); setActiveTP(null); }, [showToast]);

  let body;
  if (!session) {
    body = h(Login, { dcSites: DC_SITES, hubSites: HUB_SITES, onLogin: handleLogin, loggingIn, error: loginError });
  } else if (!activeTP) {
    body = h(Picker, { session, onSelect: setActiveTP, onLogout: handleLogout });
  } else if (activeTP === 'tp1') {
    body = h(TP1Panel, { api, session, onDone: handleDone, onBack: () => setActiveTP(null) });
  } else if (activeTP === 'tp2') {
    body = h(TP2Panel, { api, session, hubSites: HUB_SITES, onDone: handleDone, onBack: () => setActiveTP(null) });
  } else {
    // TP3-TP7, WSW1-2, and the 4 non-linear flows follow the identical
    // pattern as TP1Panel/TP2Panel in components.js — see
    // frontend-react/README.md for the exact porting checklist.
    body = h('div', { className: 'panel' },
      h('button', { type: 'button', className: 'back-link', onClick: () => setActiveTP(null) }, '‹ Touch points'),
      h('h2', null, activeTP.toUpperCase()),
      h('div', { className: 'desc' }, 'Not yet ported to this React build — see frontend-react/README.md. Fully working in frontend/mercury-scanner.html.')
    );
  }

  return h(React.Fragment, null,
    body,
    toast && h('div', { className: 'toast show' }, toast)
  );
}

const root = createRoot(document.getElementById('root'));
root.render(h(App));
