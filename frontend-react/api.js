// api.js — same backend contract as frontend/api-client.js, as an ES module.
export function createApi(baseUrl, getToken) {
  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch { /* e.g. 204 */ }
    if (!res.ok) throw new Error((data && data.error) || ('request failed: ' + res.status));
    return data;
  }
  return {
    login: (operatorName, role, siteCode) => request('POST', '/api/auth/login', { operatorName, role, siteCode }),
    getSites: (type) => request('GET', `/api/sites${type ? '?type=' + encodeURIComponent(type) : ''}`),
    getManifests: (params = {}) => request('GET', `/api/manifests?${new URLSearchParams(params)}`),
    getAssets: (params = {}) => request('GET', `/api/assets?${new URLSearchParams(params)}`),
    tp1Open: (siteCode, assetIds) => request('POST', '/api/touchpoints/tp1-open', { siteCode, assetIds }),
    tp2Close: (manifestId, destinationHubCode, scannedAssetIds) => request('POST', '/api/touchpoints/tp2-close', { manifestId, destinationHubCode, scannedAssetIds }),
  };
}
