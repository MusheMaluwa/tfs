// shared/api.js
//
// THE one place the backend contract lives. Both the scanner app and
// the console app import this exact file — not a copy — so a field
// rename or a new endpoint is a single edit that both apps pick up.
// That sharing is the whole reason the two apps live in one folder
// while staying separate React roots.
//
// Mirrors backend/README.md's API table. Every method returns parsed
// JSON and throws an Error carrying the server's `error` string on a
// non-2xx, so callers can `catch (e) { setErr(e.message) }`.

export function createApi(baseUrl, getToken) {
  async function request(method, path, body, extraHeaders) {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* e.g. 204 No Content */ }
    if (!res.ok) throw new Error((data && data.error) || ('request failed: ' + res.status));
    return data;
  }

  const qs = (params) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const s = new URLSearchParams(clean).toString();
    return s ? '?' + s : '';
  };

  return {
    /* ---- auth ---- */
    login: (operatorName, role, siteCode) =>
      request('POST', '/api/auth/login', { operatorName, role, siteCode }),

    /* ---- reads: used by both apps ---- */
    getSites: (type) => request('GET', '/api/sites' + qs({ type })),
    getAssets: (params = {}) => request('GET', '/api/assets' + qs(params)),
    getAsset: (id) => request('GET', '/api/assets/' + encodeURIComponent(id)),
    getManifests: (params = {}) => request('GET', '/api/manifests' + qs(params)),
    getManifest: (id) => request('GET', '/api/manifests/' + encodeURIComponent(id)),
    getExceptions: (limit) => request('GET', '/api/exceptions' + qs({ limit })),
    getDashboardSummary: () => request('GET', '/api/dashboard/summary'),

    /* ---- writes: console (back-office administration, DC role) ---- */
    createAsset: (type, homeSiteCode, id) => request('POST', '/api/assets', { type, homeSiteCode, id }),
    createSite: (code, name, type, lat, lng) => request('POST', '/api/sites', { code, name, type, lat, lng }),
    deleteSite: (code) => request('DELETE', '/api/sites/' + encodeURIComponent(code)),

    /* ---- writes: scanner (touch points) ----
       Each takes an optional idempotencyKey as its last argument. A
       retried request with the same key returns the original result
       instead of double-processing it — see backend/README.md. */
    tp1Open: (siteCode, assetIds, key) =>
      request('POST', '/api/touchpoints/tp1-open', { siteCode, assetIds }, idem(key)),
    tp2Close: (manifestId, destinationHubCode, scannedAssetIds, key) =>
      request('POST', '/api/touchpoints/tp2-close', { manifestId, destinationHubCode, scannedAssetIds }, idem(key)),
    tp3Intake: (manifestId, scannedAssetIds, key) =>
      request('POST', '/api/touchpoints/tp3-intake', { manifestId, scannedAssetIds }, idem(key)),
    tp4Loaded: (manifestId, notLoadedReasons, key) =>
      request('POST', '/api/touchpoints/tp4-loaded', { manifestId, notLoadedReasons }, idem(key)),
    tp5HubIntake: (manifestId, scannedAssetIds, key) =>
      request('POST', '/api/touchpoints/tp5-hub-intake', { manifestId, scannedAssetIds }, idem(key)),
    tp6EmptyCollection: (stagedAssetIds, key) =>
      request('POST', '/api/touchpoints/tp6-empty-collection', { stagedAssetIds }, idem(key)),
    tp7ReturnReceipt: (manifestId, scannedAssetIds, destinationCode, isReturnsFacility, key) =>
      request('POST', '/api/touchpoints/tp7-return-receipt', { manifestId, scannedAssetIds, destinationCode, isReturnsFacility }, idem(key)),
    wsw1Intake: (assetId, key) => request('POST', '/api/touchpoints/wsw1-intake', { assetId }, idem(key)),
    wsw2Sort: (assetId, key) => request('POST', '/api/touchpoints/wsw2-sort', { assetId }, idem(key)),
    damagedScanOut: (assetId, note, key) => request('POST', '/api/touchpoints/damaged-scan-out', { assetId, note }, idem(key)),
    maintenanceOut: (assetId, reason, key) => request('POST', '/api/touchpoints/maintenance-out', { assetId, reason }, idem(key)),
    maintenanceIn: (assetId, key) => request('POST', '/api/touchpoints/maintenance-in', { assetId }, idem(key)),
    glsOut: (assetId, glsSite, key) => request('POST', '/api/touchpoints/gls-out', { assetId, glsSite }, idem(key)),
    glsIn: (assetId, key) => request('POST', '/api/touchpoints/gls-in', { assetId }, idem(key)),
    interDcOut: (assetId, toSiteCode, key) => request('POST', '/api/touchpoints/interdc-out', { assetId, toSiteCode }, idem(key)),
    interDcIn: (assetId, key) => request('POST', '/api/touchpoints/interdc-in', { assetId }, idem(key)),
  };
}

function idem(key) {
  return key ? { 'Idempotency-Key': key } : undefined;
}

/** A stable key for one submit attempt, so a retry after a flaky network
 *  doesn't open a second manifest. Callers generate it once per action. */
export function newIdempotencyKey() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return 'k-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}
