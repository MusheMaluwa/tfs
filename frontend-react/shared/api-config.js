// shared/api-config.js
//
// Decides which backend the apps talk to — WITHOUT anyone editing a
// file between "running locally" and "shipping". Both index.html files
// load this as a classic script before app.js, so by the time any
// module runs, window.TFS_API_BASE_URL is already correct.
//
// Why not just hardcode the deployed URL? Because then `npm run serve`
// would hit production while you develop, and every local change to
// the API would be invisible. Why not hardcode localhost? Because the
// deployed page would call the reviewer's own machine and fail. The
// origin the page was served from already tells us which case we are
// in, so nothing has to be configured by hand.
//
// Resolution order (first hit wins):
//   1. window.TFS_API_BASE_URL already set   — tests (Playwright's
//      addInitScript) and anyone embedding these pages.
//   2. ?api=<url> in the query string        — point a deployed page at
//      a tunnel or a staging API for one session; it is remembered.
//      ?api=reset clears the memory and returns to auto-detection.
//   3. localStorage override                 — what (2) remembered.
//   4. Local / LAN origin  → http://<same-host>:4000, so both
//      http://localhost:5173 and a phone on http://192.168.1.x:5173
//      reach the dev backend on the machine serving the page.
//   5. Anything else (a real deployment) → PROD_API_BASE_URL.

(function (global) {
  // The deployed backend (Render + MongoDB Atlas). Changing hosts is a
  // one-line edit here rather than a hunt through every index.html.
  var PROD_API_BASE_URL = 'https://tfs-dfj3.onrender.com';
  var LOCAL_API_PORT = 4000;
  var STORAGE_KEY = 'tfs_api_base_url';

  var loc = global.location || {};
  var host = loc.hostname || '';

  function trim(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function store(key, value) {
    // Private-mode browsers throw on localStorage rather than no-op,
    // and a storage failure must never stop the app from loading.
    try {
      if (value === null) global.localStorage.removeItem(key);
      else global.localStorage.setItem(key, value);
    } catch (e) { /* ignore */ }
  }

  function read(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }

  // file:// gives an empty hostname; treat it as local so the legacy
  // pages opened straight from disk still find the dev backend.
  function isLocalOrigin() {
    if (loc.protocol === 'file:' || host === '') return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;
    if (/\.local$/i.test(host)) return true;
    // RFC 1918 ranges — a phone or tablet testing against the dev
    // machine over wifi is still "local", just not on 127.0.0.1.
    return /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host);
  }

  function resolve() {
    if (global.TFS_API_BASE_URL) return { url: trim(global.TFS_API_BASE_URL), source: 'preset' };

    var q = null;
    try { q = new URLSearchParams(loc.search || '').get('api'); } catch (e) { /* ignore */ }
    if (q === 'reset' || q === 'auto') {
      store(STORAGE_KEY, null);
    } else if (q) {
      var picked = trim(q);
      store(STORAGE_KEY, picked);
      return { url: picked, source: 'query' };
    }

    var saved = trim(read(STORAGE_KEY));
    if (saved) return { url: saved, source: 'localStorage' };

    if (isLocalOrigin()) {
      var localHost = host || 'localhost';
      return { url: loc.protocol === 'file:' ? 'http://localhost:' + LOCAL_API_PORT
                                             : 'http://' + localHost + ':' + LOCAL_API_PORT,
               source: 'local' };
    }

    return { url: PROD_API_BASE_URL, source: 'production' };
  }

  var resolved = resolve();
  global.TFS_API_BASE_URL = resolved.url;

  // Exposed so a screen can show which API it is on, and so you can
  // switch without touching the URL bar:
  //   TFS_API_CONFIG.set('https://staging.example.com')  (reloads)
  //   TFS_API_CONFIG.reset()                             (back to auto)
  global.TFS_API_CONFIG = {
    baseUrl: resolved.url,
    source: resolved.source,
    productionUrl: PROD_API_BASE_URL,
    set: function (url) { store(STORAGE_KEY, trim(url)); global.location.reload(); },
    reset: function () { store(STORAGE_KEY, null); global.location.reload(); },
  };

  if (global.console && console.info) {
    console.info('[TFS] API base URL: ' + resolved.url + ' (' + resolved.source + ')');
  }
})(typeof window !== 'undefined' ? window : globalThis);
