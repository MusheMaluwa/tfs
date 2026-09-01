// frontend/api-client.js
//
// Thin fetch wrapper for the TFS Logistics backend. One function per
// endpoint, matching src/routes/*.js exactly. This replaces every
// localStorage read/write in mercury-scanner.html / mercury-console.html
// per TECHNICAL-SPEC.md §7 — the mapping table there names which
// frontend function each of these replaces.
//
// Usage: <script src="api-client.js"></script> then call e.g.
// await TFSApi.login({ operatorName, role, siteCode }) — token is
// stored in memory (window) plus sessionStorage so a page reload
// during a shift doesn't force a re-login.

(function (global) {
  const BASE_URL = global.TFS_API_BASE_URL || 'http://localhost:4000';
  let token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('tfs_token')) || null;

  function setToken(t) {
    token = t;
    if (typeof sessionStorage !== 'undefined') {
      if (t) sessionStorage.setItem('tfs_token', t); else sessionStorage.removeItem('tfs_token');
    }
  }

  async function request(method, path, body, idempotencyKey) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* e.g. 204 No Content */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `request failed: ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  const TFSApi = {
    setToken, getToken: () => token,
    isLoggedIn: () => !!token,
    logout: () => setToken(null),

    // ---- auth ----
    async login({ operatorName, role, siteCode }) {
      const data = await request('POST', '/api/auth/login', { operatorName, role, siteCode });
      setToken(data.token);
      return data;
    },

    // ---- sites ----
    getSites: (type) => request('GET', `/api/sites${type ? `?type=${encodeURIComponent(type)}` : ''}`),
    addSite: (site) => request('POST', '/api/sites', site),
    removeSite: (code) => request('DELETE', `/api/sites/${encodeURIComponent(code)}`),

    // ---- assets ----
    getAssets: (params = {}) => request('GET', `/api/assets?${new URLSearchParams(params)}`),
    getAsset: (id) => request('GET', `/api/assets/${encodeURIComponent(id)}`),
    registerAsset: (asset) => request('POST', '/api/assets', asset),

    // ---- manifests / exceptions / dashboard ----
    getManifests: (params = {}) => request('GET', `/api/manifests?${new URLSearchParams(params)}`),
    getManifest: (id) => request('GET', `/api/manifests/${encodeURIComponent(id)}`),
    getExceptions: (limit) => request('GET', `/api/exceptions${limit ? `?limit=${limit}` : ''}`),
    getDashboardSummary: () => request('GET', '/api/dashboard/summary'),

    // ---- touch points (one function per endpoint; idempotencyKey optional but recommended) ----
    tp1Open: (siteCode, assetIds, idempotencyKey) => request('POST', '/api/touchpoints/tp1-open', { siteCode, assetIds }, idempotencyKey),
    tp2Close: (manifestId, destinationHubCode, scannedAssetIds, idempotencyKey) => request('POST', '/api/touchpoints/tp2-close', { manifestId, destinationHubCode, scannedAssetIds }, idempotencyKey),
    tp3Intake: (manifestId, scannedAssetIds, idempotencyKey) => request('POST', '/api/touchpoints/tp3-intake', { manifestId, scannedAssetIds }, idempotencyKey),
    tp4Loaded: (manifestId, notLoadedReasons, idempotencyKey) => request('POST', '/api/touchpoints/tp4-loaded', { manifestId, notLoadedReasons }, idempotencyKey),
    tp5HubIntake: (manifestId, scannedAssetIds, idempotencyKey) => request('POST', '/api/touchpoints/tp5-hub-intake', { manifestId, scannedAssetIds }, idempotencyKey),
    tp6EmptyCollection: (stagedAssetIds, idempotencyKey) => request('POST', '/api/touchpoints/tp6-empty-collection', { stagedAssetIds }, idempotencyKey),
    tp7ReturnReceipt: (manifestId, scannedAssetIds, destinationCode, isReturnsFacility, idempotencyKey) => request('POST', '/api/touchpoints/tp7-return-receipt', { manifestId, scannedAssetIds, destinationCode, isReturnsFacility }, idempotencyKey),

    wsw1Intake: (assetId, idempotencyKey) => request('POST', '/api/touchpoints/wsw1-intake', { assetId }, idempotencyKey),
    wsw2Sort: (assetId, idempotencyKey) => request('POST', '/api/touchpoints/wsw2-sort', { assetId }, idempotencyKey),

    damagedScanOut: (assetId, note, idempotencyKey) => request('POST', '/api/touchpoints/damaged-scan-out', { assetId, note }, idempotencyKey),
    maintenanceOut: (assetId, reason, idempotencyKey) => request('POST', '/api/touchpoints/maintenance-out', { assetId, reason }, idempotencyKey),
    maintenanceIn: (assetId, idempotencyKey) => request('POST', '/api/touchpoints/maintenance-in', { assetId }, idempotencyKey),
    glsOut: (assetId, glsSite, idempotencyKey) => request('POST', '/api/touchpoints/gls-out', { assetId, glsSite }, idempotencyKey),
    glsIn: (assetId, idempotencyKey) => request('POST', '/api/touchpoints/gls-in', { assetId }, idempotencyKey),
    interDcOut: (assetId, toSiteCode, idempotencyKey) => request('POST', '/api/touchpoints/interdc-out', { assetId, toSiteCode }, idempotencyKey),
    interDcIn: (assetId, idempotencyKey) => request('POST', '/api/touchpoints/interdc-in', { assetId }, idempotencyKey),
  };

  global.TFSApi = TFSApi;
})(typeof window !== 'undefined' ? window : globalThis);
