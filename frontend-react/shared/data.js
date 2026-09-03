// shared/data.js
//
// LOCAL DEMO DATA — the stand-in for the MongoDB backend.
//
// The backend in ../backend is not being run right now (see the
// commented-out imports at the top of scanner/app.js and
// console/app.js). Nothing there was deleted: the Node API, the Mongo
// schema and shared/api.js's HTTP client are all still in the
// repository, and switching back is two comment markers per app.
//
// What this file provides:
//
//   1. The seed fleet — sites, assets, manifests, custody log,
//      exceptions, tagging counters. Hardcoded, right below.
//   2. `createApi(baseUrl, getToken)` — the SAME surface shared/api.js
//      exposes, method for method, implemented against that data in
//      the browser instead of over HTTP. Every panel, table and modal
//      therefore works unchanged; none of them know the difference.
//
// The write paths are ports of backend/src/lib/stateMachine.js: the
// same guards, the same status strings, the same exception types, the
// same error messages. That is deliberate — a flow that is refused
// here is refused by the real API too, so demoing against this does
// not teach anyone the wrong rules.
//
// State lives in localStorage, so a scan in the scanner tab is visible
// in the console tab, and a reload does not undo the last hour of
// demoing. To wipe it and start from the seed again, run
// `TFS.resetLocalData()` in the browser console (or clear site data).
//
// Timestamps are ISO 8601 strings everywhere, exactly as the real API
// returns them over JSON — shared/format.js already expects that.

const STORAGE_KEY = 'tfs_local_data_v1';

const iso = (d) => new Date(d).toISOString();
const daysAgo = (n) => iso(Date.now() - n * 86400000);
const hoursAgo = (n) => iso(Date.now() - n * 3600000);

// ---------------------------------------------------------------------
// 1. SITES — the network. Codes are what operators pick at login.
// ---------------------------------------------------------------------
const SITES = [
  // code, name, type
  ['JHB-DC1', 'Johannesburg DC 1', 'DC'],
  ['JHB-DC3', 'Johannesburg DC 3', 'DC'],
  ['CPT-DC1', 'Cape Town DC 1', 'DC'],
  ['CPT-DC3', 'Cape Town DC 3', 'DC'],
  ['DBN-DC1', 'Durban DC 1', 'DC'],
  ['Alberton (ALB)', 'Alberton', 'Hub'],
  ['Bryanston (BRY)', 'Bryanston', 'Hub'],
  ['George (GEO)', 'George', 'Hub'],
  ['Bloemfontein (BLO)', 'Bloemfontein', 'Hub'],
  ['Returns Facility — Isando', 'Isando Returns Facility', 'Returns'],
  ['GLS Johannesburg', 'GLS Johannesburg', 'GLS'],
  ['GLS Cape Town', 'GLS Cape Town', 'GLS'],
];

// ---------------------------------------------------------------------
// 2. ASSETS — one row per Rolltainer / Hyper Cage.
//
// Spread across every state on purpose, so each touch point has
// something to work on the moment the app opens:
//
//   TP1  needs "Available at DC"      -> RT-100001..010
//   TP2  needs a stage-1 dispatch     -> MAN-480001
//   TP3  needs a stage-2 dispatch     -> MAN-480002
//   TP4  needs a stage-3 dispatch     -> MAN-480003 (one asset short,
//                                        so the reason-code path shows)
//   TP5  needs a stage-4 dispatch     -> MAN-480004
//   TP6  needs assets at a hub        -> Alberton (ALB), one aged 9 days
//   TP7  needs a stage-6 return       -> RET-730001
//   WSW2 needs "At WSW: <dc>"         -> RT-100024
//   the non-linear scan-ins need      -> RT-100025 (maint), RT-100026
//                                        (GLS), RT-100027 (inter-DC)
// ---------------------------------------------------------------------
const ASSETS = [
  // id, type, home_site_code, status, stage, extras
  ['RT-100001', 'Hyper Cage', 'JHB-DC1', 'Available at DC', 0],
  ['RT-100002', 'Rolltainer', 'JHB-DC1', 'Available at DC', 0],
  ['RT-100003', 'Hyper Cage', 'JHB-DC1', 'Available at DC', 0],
  ['RT-100004', 'Rolltainer', 'JHB-DC3', 'Available at DC', 0],
  ['RT-100005', 'Hyper Cage', 'JHB-DC3', 'Available at DC', 0],
  ['RT-100006', 'Rolltainer', 'CPT-DC1', 'Available at DC', 0],
  ['RT-100007', 'Hyper Cage', 'CPT-DC1', 'Available at DC', 0],
  ['RT-100008', 'Rolltainer', 'CPT-DC3', 'Available at DC', 0],
  ['RT-100009', 'Hyper Cage', 'DBN-DC1', 'Available at DC', 0],
  ['RT-100010', 'Rolltainer', 'DBN-DC1', 'Available at DC', 0],

  // On MAN-480001 — opened at TP1, waiting for TP2 to close it.
  ['RT-100011', 'Rolltainer', 'JHB-DC1', 'In Dispatch', 1, { manifest_id: 'MAN-480001', manifest_kind: 'dispatch' }],
  ['RT-100012', 'Hyper Cage', 'JHB-DC1', 'In Dispatch', 1, { manifest_id: 'MAN-480001', manifest_kind: 'dispatch' }],

  // On MAN-480002 — closed at TP2, waiting for the TDT to take it in.
  ['RT-100013', 'Rolltainer', 'JHB-DC1', 'Dispatched — In Transit', 2, { manifest_id: 'MAN-480002', manifest_kind: 'dispatch' }],
  ['RT-100014', 'Hyper Cage', 'JHB-DC1', 'Dispatched — In Transit', 2, { manifest_id: 'MAN-480002', manifest_kind: 'dispatch' }],

  // On MAN-480003 — taken in at TP3, waiting on TP4's load confirmation.
  // RT-100016 was never scanned at TP3, so it is outstanding and TP4
  // will demand a reason code for it before it will accept the load.
  ['RT-100015', 'Rolltainer', 'CPT-DC1', 'Loaded on TDT — In Transit', 3, { manifest_id: 'MAN-480003', manifest_kind: 'dispatch' }],
  ['RT-100016', 'Hyper Cage', 'CPT-DC1', 'Dispatched — In Transit', 2, {
    manifest_id: 'MAN-480003', manifest_kind: 'dispatch',
    outstanding_reason: 'Pending at TDT Intake', outstanding_since: hoursAgo(6),
  }],

  // On MAN-480004 — loaded and rolling, waiting for hub intake at TP5.
  ['RT-100017', 'Rolltainer', 'JHB-DC3', 'In Transit to Hub', 4, { manifest_id: 'MAN-480004', manifest_kind: 'dispatch' }],
  ['RT-100018', 'Hyper Cage', 'JHB-DC3', 'In Transit to Hub', 4, { manifest_id: 'MAN-480004', manifest_kind: 'dispatch' }],

  // Sitting at hubs. RT-100020 has been at Alberton 9 days, so TP6
  // flags it as a priority collection and raises "Aged at Hub" if it
  // is left behind again.
  ['RT-100019', 'Rolltainer', 'JHB-DC1', 'At Hub: Alberton (ALB)', 5, { hub_arrival_at: daysAgo(3) }],
  ['RT-100020', 'Hyper Cage', 'JHB-DC1', 'At Hub: Alberton (ALB)', 5, { hub_arrival_at: daysAgo(9) }],
  ['RT-100021', 'Rolltainer', 'JHB-DC3', 'At Hub: Bryanston (BRY)', 5, { hub_arrival_at: daysAgo(2) }],

  // On RET-730001 — staged at TP6, waiting for the DC to receipt it at TP7.
  ['RT-100022', 'Rolltainer', 'JHB-DC1', 'Ready for Return — Awaiting Collection', 6, { manifest_id: 'RET-730001', manifest_kind: 'return' }],
  ['RT-100023', 'Hyper Cage', 'JHB-DC1', 'Ready for Return — Awaiting Collection', 6, { manifest_id: 'RET-730001', manifest_kind: 'return' }],

  // The non-linear flows, each with something to scan back in.
  ['RT-100024', 'Rolltainer', 'JHB-DC1', 'At WSW: JHB-DC1', 0],
  ['RT-100025', 'Hyper Cage', 'CPT-DC1', 'In Maintenance', 0],
  ['RT-100026', 'Rolltainer', 'JHB-DC1', 'With GLS Vendor: GLS Johannesburg', 0],
  ['RT-100027', 'Hyper Cage', 'DBN-DC1', 'Inter-DC Transfer to JHB-DC1', 0, { transfer_to_code: 'JHB-DC1' }],
  ['RT-100028', 'Rolltainer', 'CPT-DC3', 'Damaged / Written Off', 0],

  // Back at its DC but still carrying an unresolved miss — this is the
  // one that shows up under "Outstanding" on the dashboard.
  ['RT-100029', 'Hyper Cage', 'DBN-DC1', 'Available at DC', 0, {
    outstanding_reason: 'Missed scan at Hub Intake', outstanding_since: daysAgo(2),
  }],
];

// ---------------------------------------------------------------------
// 3. MANIFESTS. Stages: dispatch 1=open 2=closed 3=TDT intake
// 4=loaded 5=hub intake (complete); return 6=staged 7=received.
//
// MAN-479001 / RET-729001 are a finished loop — the console's average
// cycle time is measured between the two, so without a completed pair
// that KPI reads "—".
// ---------------------------------------------------------------------
const MANIFESTS = [
  {
    id: 'MAN-479001', kind: 'dispatch', origin_dc_code: 'JHB-DC1', destination_hub_code: 'Alberton (ALB)',
    stage: 5, epod_id: 'ePOD-MAN-479001', eta: daysAgo(4), completed_dispatch: 1, created_at: daysAgo(5),
    assets: ['RT-100001', 'RT-100002'],
  },
  {
    id: 'RET-729001', kind: 'return', origin_hub_code: 'Alberton (ALB)', destination_dc_code: 'JHB-DC1',
    stage: 7, completed_dispatch: 0, created_at: daysAgo(4),
    assets: ['RT-100001', 'RT-100002'],
  },
  {
    id: 'MAN-480001', kind: 'dispatch', origin_dc_code: 'JHB-DC1',
    stage: 1, completed_dispatch: 0, created_at: hoursAgo(2),
    assets: ['RT-100011', 'RT-100012'],
  },
  {
    id: 'MAN-480002', kind: 'dispatch', origin_dc_code: 'JHB-DC1', destination_hub_code: 'Bryanston (BRY)',
    stage: 2, completed_dispatch: 0, created_at: hoursAgo(5),
    assets: ['RT-100013', 'RT-100014'],
  },
  {
    id: 'MAN-480003', kind: 'dispatch', origin_dc_code: 'CPT-DC1', destination_hub_code: 'George (GEO)',
    stage: 3, completed_dispatch: 0, created_at: hoursAgo(7),
    assets: ['RT-100015', 'RT-100016'],
  },
  {
    id: 'MAN-480004', kind: 'dispatch', origin_dc_code: 'JHB-DC3', destination_hub_code: 'Bryanston (BRY)',
    stage: 4, epod_id: 'ePOD-MAN-480004', eta: hoursAgo(-3), completed_dispatch: 0, created_at: hoursAgo(9),
    assets: ['RT-100017', 'RT-100018'],
  },
  {
    id: 'RET-730001', kind: 'return', origin_hub_code: 'Alberton (ALB)',
    stage: 6, completed_dispatch: 0, created_at: hoursAgo(3),
    assets: ['RT-100022', 'RT-100023'],
  },
];

// ---------------------------------------------------------------------
// 4. CUSTODY LOG — the chain of custody the console's asset modal shows.
// ---------------------------------------------------------------------
const CUSTODY = [
  // asset_id, hours ago, note, operator
  ['RT-100001', 120, 'TP1 Dispatch Open', 'T. Nkosi'],
  ['RT-100001', 118, 'TP2 Dispatch Close', 'T. Nkosi'],
  ['RT-100001', 112, 'TP3 TDT Intake', 'S. Pillay'],
  ['RT-100001', 110, 'TP4 Dispatch Loaded — ePOD generated', 'S. Pillay'],
  ['RT-100001', 100, 'TP5 Hub Intake at Alberton (ALB)', 'M. Dlamini'],
  ['RT-100001', 96, 'TP6 Empty Collection staged at Alberton (ALB)', 'M. Dlamini'],
  ['RT-100001', 90, 'TP7 Return Receipt — chain-of-custody archived', 'T. Nkosi'],
  ['RT-100002', 120, 'TP1 Dispatch Open', 'T. Nkosi'],
  ['RT-100002', 90, 'TP7 Return Receipt — chain-of-custody archived', 'T. Nkosi'],
  ['RT-100011', 2, 'TP1 Dispatch Open', 'T. Nkosi'],
  ['RT-100012', 2, 'TP1 Dispatch Open', 'T. Nkosi'],
  ['RT-100013', 6, 'TP1 Dispatch Open', 'T. Nkosi'],
  ['RT-100013', 5, 'TP2 Dispatch Close', 'T. Nkosi'],
  ['RT-100014', 6, 'TP1 Dispatch Open', 'T. Nkosi'],
  ['RT-100014', 5, 'TP2 Dispatch Close', 'T. Nkosi'],
  ['RT-100015', 8, 'TP1 Dispatch Open', 'A. Botha'],
  ['RT-100015', 7, 'TP2 Dispatch Close', 'A. Botha'],
  ['RT-100015', 6, 'TP3 TDT Intake', 'S. Pillay'],
  ['RT-100016', 8, 'TP1 Dispatch Open', 'A. Botha'],
  ['RT-100016', 7, 'TP2 Dispatch Close', 'A. Botha'],
  ['RT-100017', 10, 'TP2 Dispatch Close', 'L. Khumalo'],
  ['RT-100017', 9, 'TP4 Dispatch Loaded — ePOD generated', 'S. Pillay'],
  ['RT-100018', 9, 'TP4 Dispatch Loaded — ePOD generated', 'S. Pillay'],
  ['RT-100019', 72, 'TP5 Hub Intake at Alberton (ALB)', 'M. Dlamini'],
  ['RT-100020', 216, 'TP5 Hub Intake at Alberton (ALB)', 'M. Dlamini'],
  ['RT-100022', 3, 'TP6 Empty Collection staged at Alberton (ALB)', 'M. Dlamini'],
  ['RT-100023', 3, 'TP6 Empty Collection staged at Alberton (ALB)', 'M. Dlamini'],
  ['RT-100024', 20, 'WSW Intake — received misrouted stock at JHB-DC1', 'P. Naidoo'],
  ['RT-100025', 48, 'Maintenance Scan-Out — damaged castor wheel', 'A. Botha'],
  ['RT-100026', 30, 'GLS Vendor Custody — transferred to GLS Johannesburg', 'T. Nkosi'],
  ['RT-100027', 26, 'Inter-DC Transfer — scanned out to JHB-DC1', 'K. Mokoena'],
  ['RT-100028', 60, 'Damaged Asset Scan-Out — frame buckled in transit', 'S. Pillay'],
];

// ---------------------------------------------------------------------
// 5. EXCEPTIONS — the console's exception feed and its KPI count.
// ---------------------------------------------------------------------
const EXCEPTIONS = [
  // type, asset_id, note, hours ago
  ['Missed Scan', 'RT-100029', 'Expected at Hub Intake but not scanned within timeout.', 48],
  ['Missed Scan', 'RT-100016', 'Not scanned at TP3 for manifest MAN-480003.', 6],
  ['Aged at Hub', 'RT-100020', 'RT-100020 at hub Alberton (ALB) for 9 days — priority collection alert.', 5],
  ['Damaged', 'RT-100028', 'Scanned out as damaged by S. Pillay: frame buckled in transit', 60],
];

/** Fleet-wide tagging coverage — the "77% -> 100%" KPI. `total_fleet`
 *  is the whole physical fleet; `tagged_fleet` is how many carry a
 *  barcode, which is what registering an asset in the console bumps. */
const TOTAL_FLEET = 38;

// =====================================================================
// The store: the seed above, turned into the row shapes the API returns.
// =====================================================================

function seedStore() {
  const assets = ASSETS.map(([id, type, home, status, stage, extra]) => ({
    id,
    type,
    home_site_code: home,
    status,
    stage,
    outstanding_reason: null,
    outstanding_since: null,
    manifest_id: null,
    manifest_kind: null,
    hub_arrival_at: null,
    transfer_to_code: null,
    registered_at: daysAgo(60 + (Number(id.slice(-3)) % 40)),
    ...(extra || {}),
  }));

  const manifests = MANIFESTS.map((m) => ({
    id: m.id,
    kind: m.kind,
    origin_dc_code: m.origin_dc_code || null,
    destination_hub_code: m.destination_hub_code || null,
    origin_hub_code: m.origin_hub_code || null,
    destination_dc_code: m.destination_dc_code || null,
    stage: m.stage,
    epod_id: m.epod_id || null,
    eta: m.eta || null,
    completed_dispatch: m.completed_dispatch,
    created_at: m.created_at,
  }));

  const manifestAssets = MANIFESTS.flatMap((m) => m.assets.map((assetId) => ({
    manifest_id: m.id,
    asset_id: assetId,
    expected: 1,
    scanned: 1,
    scanned_at: m.created_at,
  })));

  return {
    sites: SITES.map(([code, name, type]) => ({ code, name, type, lat: null, lng: null, created_at: daysAgo(400) })),
    assets,
    manifests,
    manifestAssets,
    custodyLog: CUSTODY.map(([assetId, hrs, note, operator], i) => ({
      id: 'cl-' + String(i + 1).padStart(4, '0'), asset_id: assetId, ts: hoursAgo(hrs), note, operator,
    })),
    exceptions: EXCEPTIONS.map(([type, assetId, note, hrs], i) => ({
      id: 'ex-' + String(i + 1).padStart(4, '0'), ts: hoursAgo(hrs), type, asset_id: assetId, note,
    })),
    fleetCounters: { tagged_fleet: ASSETS.length, total_fleet: TOTAL_FLEET },
    // Replays a repeated Idempotency-Key instead of processing twice,
    // the same as the real API's cache does.
    idempotency: {},
  };
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/** localStorage is the store, so the scanner and the console see the
 *  same fleet. If it is unavailable (private mode, file://) everything
 *  still works — it just lives in this tab's memory for the session. */
let memoryStore = null;

function loadStore() {
  try {
    const raw = globalThis.localStorage && globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to memory */ }
  if (!memoryStore) memoryStore = seedStore();
  return memoryStore;
}

function saveStore(store) {
  memoryStore = store;
  try {
    if (globalThis.localStorage) globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* memory-only is a fine fallback */ }
}

/** Wipes local state back to the seed above. Exposed as
 *  TFS.resetLocalData() for demos that have wandered off. */
export function resetLocalData() {
  memoryStore = null;
  try { if (globalThis.localStorage) globalThis.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  const fresh = seedStore();
  saveStore(fresh);
  return fresh;
}

// Make sure the seed exists the first time either app loads.
saveStore(loadStore());

if (typeof window !== 'undefined') {
  window.TFS = { ...(window.TFS || {}), resetLocalData, seedStore };
}

// =====================================================================
// Auth. No server to sign a token, so the "token" simply carries the
// session — the real one is an HMAC-signed JWT (backend/src/lib/auth.js)
// and is the swap point for real SSO. Same payload fields either way.
// =====================================================================

const VALID_ROLES = ['DC', 'TDT', 'Hub', 'WSW', 'Viewer'];
const TOKEN_TTL_SECONDS = 12 * 60 * 60;
const TOKEN_PREFIX = 'local.';

function issueToken({ operatorName, role, siteCode }) {
  const payload = {
    sub: operatorName,
    role,
    site: siteCode || null,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  return TOKEN_PREFIX + encodeURIComponent(JSON.stringify(payload));
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) return null;
  let payload;
  try { payload = JSON.parse(decodeURIComponent(token.slice(TOKEN_PREFIX.length))); } catch { return null; }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// =====================================================================
// Helpers shared by the write paths — ports of stateMachine.js.
// =====================================================================

let idSeq = 0;
function newId(prefix) { idSeq += 1; return prefix + '-' + Date.now().toString(36) + '-' + idSeq; }
function genId(prefix) { return prefix + '-' + String(Math.floor(100000 + Math.random() * 899999)); }

function fail(message) { throw new Error(message); }

function findAsset(store, id) { return store.assets.find((a) => a.id === id); }
function findManifest(store, id) { return store.manifests.find((m) => m.id === id); }
function expectedAssetIds(store, manifestId) {
  return store.manifestAssets.filter((r) => r.manifest_id === manifestId && r.expected).map((r) => r.asset_id);
}
function setAsset(store, id, fields) { Object.assign(findAsset(store, id), fields); }
function markScanned(store, manifestId, assetId) {
  const row = store.manifestAssets.find((r) => r.manifest_id === manifestId && r.asset_id === assetId);
  if (row) { row.scanned = 1; row.scanned_at = iso(Date.now()); }
}
function logCustody(store, assetId, note, operator) {
  store.custodyLog.push({ id: newId('cl'), asset_id: assetId, ts: iso(Date.now()), note, operator: operator || null });
}
function logException(store, type, assetId, note) {
  store.exceptions.push({ id: newId('ex'), ts: iso(Date.now()), type, asset_id: assetId, note });
}
function ageDays(ts) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
}
function upsertJoin(store, manifestId, assetId) {
  const existing = store.manifestAssets.find((r) => r.manifest_id === manifestId && r.asset_id === assetId);
  const row = { manifest_id: manifestId, asset_id: assetId, expected: 1, scanned: 1, scanned_at: iso(Date.now()) };
  if (existing) Object.assign(existing, row);
  else store.manifestAssets.push(row);
}

/** The four join fields both frontends read off a manifest. */
function joinRowsFor(store, manifestId) {
  return store.manifestAssets
    .filter((r) => r.manifest_id === manifestId)
    .map((r) => ({ asset_id: r.asset_id, expected: r.expected, scanned: r.scanned, scanned_at: r.scanned_at }));
}

/** The dashboard's 11 buckets. Must stay in step with
 *  shared/format.js's rollupStatus and the backend's copy of it. */
function rollupStatus(asset) {
  if (asset.outstanding_reason) return 'Outstanding';
  const s = asset.status || '';
  if (s.startsWith('Available')) return 'Available';
  if (s.startsWith('In Dispatch')) return 'In Dispatch';
  if (s.includes('In Transit')) return 'In Transit';
  if (s.startsWith('At Hub')) return 'At Hub';
  if (s.startsWith('At WSW')) return 'At WSW';
  if (s.startsWith('Ready for Return')) return 'Ready for Return';
  if (s === 'Damaged / Written Off') return 'Damaged';
  if (s === 'In Maintenance') return 'Maintenance';
  if (s.startsWith('With GLS Vendor')) return 'GLS Custody';
  if (s.startsWith('Inter-DC Transfer')) return 'Inter-DC Transfer';
  return 'Available';
}

// =====================================================================
// createApi — identical surface to shared/api.js. Swap the import in
// an app's entry point and nothing downstream changes.
// =====================================================================

export function createApi(baseUrl, getToken) {
  /** Every read: load, and answer from a copy, so a caller holding on
   *  to a row cannot mutate the store through it.
   *
   *  Reads need a token, exactly as the API's requireAuth does — GET
   *  /api/sites is the one public endpoint, because the login screen
   *  has to populate its site picker before anyone has a token. Pass
   *  `public: true` for that one. */
  function read(fn, options = {}) {
    return Promise.resolve().then(() => {
      if (!options.public) requireUser();
      return clone(fn(loadStore()));
    });
  }

  function requireUser(roles) {
    const user = verifyToken(getToken());
    if (!user) fail('unauthorized');
    if (roles && roles.length && !roles.includes(user.role)) fail(`requires role: ${roles.join(' or ')}`);
    return user;
  }

  /** Every write: role-gate, apply, persist. `roles` is the same gate
   *  the backend enforces in middleware/auth.js. */
  function write(roles, fn) {
    return Promise.resolve().then(() => {
      const store = loadStore();
      const user = requireUser(roles);
      const result = fn(store, user);
      saveStore(store);
      return result === null || result === undefined ? null : clone(result);
    });
  }

  /** A touch point: role-gated, and replayed rather than re-run when
   *  the same Idempotency-Key comes back (a retry after a flaky tap). */
  function touchpoint(roles, key, fn) {
    return Promise.resolve().then(() => {
      const store = loadStore();
      const user = requireUser(roles);
      if (key && store.idempotency[key]) return clone(store.idempotency[key]);
      const body = { ok: true, ...(fn(store, user) || {}) };
      if (key) store.idempotency[key] = body;
      saveStore(store);
      return clone(body);
    });
  }

  return {
    /* ---- auth ---- */
    login: (operatorName, role, siteCode) => Promise.resolve().then(() => {
      const store = loadStore();
      if (!operatorName || !role) fail('operatorName and role are required');
      if (!VALID_ROLES.includes(role)) fail(`role must be one of: ${VALID_ROLES.join(', ')}`);
      if (siteCode && !store.sites.some((s) => s.code === siteCode)) fail('unknown siteCode');
      return { token: issueToken({ operatorName, role, siteCode }), expiresInSeconds: TOKEN_TTL_SECONDS };
    }),

    /* ---- reads: used by both apps ---- */
    getSites: (type) => read((store) => {
      const rows = type ? store.sites.filter((s) => s.type === type) : store.sites.slice();
      return rows.sort((a, b) => (type ? 0 : a.type.localeCompare(b.type)) || a.name.localeCompare(b.name));
    }, { public: true }),

    getAssets: (params = {}) => read((store) => store.assets
      .filter((a) => (!params.type || a.type === params.type)
        && (!params.site || a.home_site_code === params.site)
        && (!params.search || a.id.includes(params.search)))
      .sort((a, b) => a.id.localeCompare(b.id))),

    getAsset: (id) => read((store) => {
      const asset = findAsset(store, id);
      if (!asset) fail('not found');
      const custodyLog = store.custodyLog
        .filter((c) => c.asset_id === id)
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .map((c) => ({ ts: c.ts, note: c.note, operator: c.operator }));
      return { ...asset, custodyLog };
    }),

    getManifests: (params = {}) => read((store) => store.manifests
      .filter((m) => (!params.kind || m.kind === params.kind)
        && (params.stage === undefined || m.stage === Number(params.stage)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((m) => ({ ...m, assets: joinRowsFor(store, m.id) }))),

    getManifest: (id) => read((store) => {
      const manifest = findManifest(store, id);
      if (!manifest) fail('not found');
      return { ...manifest, assets: joinRowsFor(store, id) };
    }),

    getExceptions: (limit) => read((store) => store.exceptions
      .slice()
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
      .slice(0, Number(limit) || 50)),

    getDashboardSummary: () => read((store) => {
      const rollups = {
        Available: 0, 'In Dispatch': 0, 'In Transit': 0, 'At Hub': 0, 'At WSW': 0,
        'Ready for Return': 0, Outstanding: 0, Damaged: 0, Maintenance: 0,
        'GLS Custody': 0, 'Inter-DC Transfer': 0,
      };
      store.assets.forEach((a) => { rollups[rollupStatus(a)] += 1; });

      const counters = store.fleetCounters;
      const coveragePct = counters.total_fleet > 0
        ? Math.round((counters.tagged_fleet / counters.total_fleet) * 100) : 0;
      const lossRate = store.assets.length
        ? Math.round((rollups.Outstanding / store.assets.length) * 1000) / 10 : 0;

      const siteCounts = {};
      store.assets.forEach((a) => {
        const key = a.status.startsWith('At Hub:') ? a.status.replace('At Hub: ', '') : a.home_site_code;
        siteCounts[key] = (siteCounts[key] || 0) + 1;
      });

      return {
        rollups,
        kpis: { taggingCoveragePct: coveragePct, lossRatePct: lossRate, exceptionCount: store.exceptions.length },
        siteCounts,
        cached: false,
      };
    }),

    /* ---- writes: console (back-office administration, DC role) ---- */
    createAsset: (type, homeSiteCode, id) => write(['DC'], (store) => {
      if (!type || !homeSiteCode) fail('type and homeSiteCode are required');
      if (!['Rolltainer', 'Hyper Cage'].includes(type)) fail('invalid type');
      if (!store.sites.some((s) => s.code === homeSiteCode)) fail('unknown homeSiteCode');

      let barcode = id;
      if (!barcode) {
        // Same allocation rule as the API: one past the highest RT-nnnnnn.
        const highest = store.assets
          .filter((a) => a.id.startsWith('RT-'))
          .map((a) => parseInt(a.id.replace('RT-', ''), 10))
          .filter((n) => !Number.isNaN(n))
          .sort((a, b) => b - a)[0];
        barcode = 'RT-' + String((highest || 100000) + 1).padStart(6, '0');
      }
      if (findAsset(store, barcode)) fail('barcode already registered');

      const asset = {
        id: barcode,
        type,
        home_site_code: homeSiteCode,
        status: 'Available at DC',
        stage: 0,
        outstanding_reason: null,
        outstanding_since: null,
        manifest_id: null,
        manifest_kind: null,
        hub_arrival_at: null,
        transfer_to_code: null,
        registered_at: iso(Date.now()),
      };
      store.assets.push(asset);
      store.fleetCounters.tagged_fleet += 1;
      return asset;
    }),

    createSite: (code, name, type, lat, lng) => write(['DC'], (store) => {
      if (!code || !name || !type) fail('code, name, and type are required');
      if (!['DC', 'Hub', 'Returns', 'GLS'].includes(type)) fail('invalid type');
      if (store.sites.some((s) => s.code === code)) fail('a site with that code already exists');
      const site = { code, name, type, lat: lat ?? null, lng: lng ?? null, created_at: iso(Date.now()) };
      store.sites.push(site);
      return site;
    }),

    deleteSite: (code) => write(['DC'], (store) => {
      // No foreign keys here either — this check is the only thing
      // stopping an asset from pointing at a site that no longer exists.
      const inUse = store.assets.some((a) => a.home_site_code === code || a.transfer_to_code === code)
        || store.manifests.some((m) => [m.origin_dc_code, m.destination_hub_code, m.origin_hub_code, m.destination_dc_code].includes(code));
      if (inUse) fail('site is in use by an asset or manifest');
      const before = store.sites.length;
      store.sites = store.sites.filter((s) => s.code !== code);
      if (store.sites.length === before) fail('not found');
      return null;
    }),

    /* ---- writes: scanner (touch points) ---- */

    // TP1 — DC Dispatch Open. Opens a manifest from what was scanned.
    tp1Open: (siteCode, assetIds, key) => touchpoint(['DC'], key, (store, user) => {
      const site = siteCode || user.site;
      if (!assetIds || assetIds.length === 0) fail('at least one asset must be scanned');
      const manifestId = genId('MAN');
      store.manifests.push({
        id: manifestId, kind: 'dispatch', origin_dc_code: site, destination_hub_code: null,
        origin_hub_code: null, destination_dc_code: null, stage: 1, epod_id: null, eta: null,
        completed_dispatch: 0, created_at: iso(Date.now()),
      });
      for (const assetId of assetIds) {
        const asset = findAsset(store, assetId);
        if (!asset) fail(`Unknown asset: ${assetId}`);
        if (asset.home_site_code !== site || asset.status !== 'Available at DC') {
          fail(`${assetId} is not available at ${site}`);
        }
        upsertJoin(store, manifestId, assetId);
        setAsset(store, assetId, {
          status: 'In Dispatch', stage: 1, manifest_id: manifestId, manifest_kind: 'dispatch',
          outstanding_reason: null, outstanding_since: null,
        });
        logCustody(store, assetId, 'TP1 Dispatch Open', user.sub);
      }
      return { manifestId };
    }),

    // TP2 — DC Dispatch Close. Anything on the manifest not re-scanned
    // here becomes outstanding and raises a Missed Scan.
    tp2Close: (manifestId, destinationHubCode, scannedAssetIds, key) => touchpoint(['DC'], key, (store, user) => {
      const manifest = findManifest(store, manifestId);
      if (!manifest || manifest.kind !== 'dispatch' || manifest.stage !== 1) fail('manifest is not open for TP2');
      const expected = expectedAssetIds(store, manifestId);
      const scannedSet = new Set(scannedAssetIds);
      const missing = expected.filter((id) => !scannedSet.has(id));

      manifest.destination_hub_code = destinationHubCode;
      manifest.stage = 2;
      for (const assetId of expected) {
        if (missing.includes(assetId)) {
          setAsset(store, assetId, { outstanding_reason: 'Missing at Dispatch Close', outstanding_since: iso(Date.now()) });
          logException(store, 'Missed Scan', assetId, `Not scanned at TP2 on manifest ${manifestId}.`);
        } else {
          setAsset(store, assetId, { status: 'Dispatched — In Transit', stage: 2, outstanding_reason: null, outstanding_since: null });
          markScanned(store, manifestId, assetId);
          logCustody(store, assetId, 'TP2 Dispatch Close', user.sub);
        }
      }
      for (const assetId of scannedAssetIds) {
        if (!expected.includes(assetId)) logException(store, 'Unexpected Asset', assetId, `Scanned at TP2 but not on manifest ${manifestId}.`);
      }
      return { missing };
    }),

    // TP3 — TDT Dispatch Intake.
    tp3Intake: (manifestId, scannedAssetIds, key) => touchpoint(['TDT'], key, (store, user) => {
      const manifest = findManifest(store, manifestId);
      if (!manifest || manifest.kind !== 'dispatch' || manifest.stage !== 2) fail('manifest is not ready for TP3');
      const expected = expectedAssetIds(store, manifestId);
      const scannedSet = new Set();
      const unexpected = [];
      for (const assetId of scannedAssetIds) {
        if (!expected.includes(assetId)) unexpected.push(assetId);
        else scannedSet.add(assetId);
      }
      const pending = expected.filter((id) => !scannedSet.has(id));

      for (const assetId of unexpected) {
        logException(store, 'Unexpected Asset', assetId, `Scanned at TP3 but not on manifest ${manifestId}.`);
      }
      manifest.stage = 3;
      for (const assetId of expected) {
        if (pending.includes(assetId)) {
          setAsset(store, assetId, { outstanding_reason: 'Pending at TDT Intake', outstanding_since: iso(Date.now()) });
          logException(store, 'Missed Scan', assetId, `Not scanned at TP3 for manifest ${manifestId}.`);
        } else {
          setAsset(store, assetId, { status: 'Loaded on TDT — In Transit', stage: 3, outstanding_reason: null, outstanding_since: null });
          markScanned(store, manifestId, assetId);
          logCustody(store, assetId, 'TP3 TDT Intake', user.sub);
        }
      }
      return { pending };
    }),

    // TP4 — TDT Dispatch Loaded. Every outstanding asset needs a reason
    // code before the load is accepted; that is the control here.
    tp4Loaded: (manifestId, notLoadedReasons, key) => touchpoint(['TDT'], key, (store, user) => {
      const reasons = notLoadedReasons || {};
      const manifest = findManifest(store, manifestId);
      if (!manifest || manifest.kind !== 'dispatch' || manifest.stage !== 3) fail('manifest is not ready for TP4');
      const expected = expectedAssetIds(store, manifestId);
      const stillMissing = expected.filter((id) => findAsset(store, id).outstanding_reason && !reasons[id]);
      if (stillMissing.length) fail(`assign a reason code to every missing asset: ${stillMissing.join(', ')}`);

      const ePodId = 'ePOD-' + manifestId;
      const eta = iso(Date.now() + (3 + Math.floor(Math.random() * 4)) * 3600000);
      manifest.stage = 4;
      manifest.epod_id = ePodId;
      manifest.eta = eta;

      for (const assetId of expected) {
        if (reasons[assetId]) {
          setAsset(store, assetId, { outstanding_reason: 'Not loaded — ' + reasons[assetId], outstanding_since: iso(Date.now()) });
          logException(store, 'Missing Asset', assetId, `Marked not loaded at TP4 (${reasons[assetId]}).`);
        } else {
          setAsset(store, assetId, { status: 'In Transit to Hub', stage: 4, outstanding_reason: null, outstanding_since: null });
          logCustody(store, assetId, 'TP4 Dispatch Loaded — ePOD generated', user.sub);
        }
      }
      return { ePodId, eta };
    }),

    // TP5 — Hub Intake. The dispatch leg is complete once this lands.
    tp5HubIntake: (manifestId, scannedAssetIds, key) => touchpoint(['Hub'], key, (store, user) => {
      const siteCode = user.site;
      const manifest = findManifest(store, manifestId);
      if (!manifest || manifest.kind !== 'dispatch' || manifest.stage !== 4) fail('manifest is not ready for TP5');
      const expected = expectedAssetIds(store, manifestId);
      const scannedSet = new Set();
      for (const assetId of scannedAssetIds) {
        if (!expected.includes(assetId)) {
          logException(store, 'Unexpected Asset', assetId, `Unexpected arrival at Hub Intake, manifest ${manifestId}.`);
        } else {
          scannedSet.add(assetId);
        }
      }
      manifest.stage = 5;
      manifest.completed_dispatch = 1;
      for (const assetId of expected) {
        if (scannedSet.has(assetId)) {
          setAsset(store, assetId, {
            status: `At Hub: ${siteCode}`, stage: 5, hub_arrival_at: iso(Date.now()),
            outstanding_reason: null, outstanding_since: null,
          });
          logCustody(store, assetId, `TP5 Hub Intake at ${siteCode}`, user.sub);
        } else {
          setAsset(store, assetId, { outstanding_reason: 'Not received at Hub Intake', outstanding_since: iso(Date.now()) });
          logException(store, 'Missing Asset', assetId, `Not received at Hub Intake for manifest ${manifestId}.`);
        }
      }
      return { received: [...scannedSet] };
    }),

    // TP6 — Hub Empty Collection. Opens the return manifest, and flags
    // anything left behind that has been at the hub a week or more.
    tp6EmptyCollection: (stagedAssetIds, key) => touchpoint(['Hub'], key, (store, user) => {
      const siteCode = user.site;
      if (!stagedAssetIds || stagedAssetIds.length === 0) fail('at least one asset must be staged');
      const returnManifestId = genId('RET');
      const atHub = store.assets.filter((a) => a.status === `At Hub: ${siteCode}`);
      const atHubIds = new Set(atHub.map((a) => a.id));

      store.manifests.push({
        id: returnManifestId, kind: 'return', origin_dc_code: null, destination_hub_code: null,
        origin_hub_code: siteCode, destination_dc_code: null, stage: 6, epod_id: null, eta: null,
        completed_dispatch: 0, created_at: iso(Date.now()),
      });
      for (const assetId of stagedAssetIds) {
        if (!atHubIds.has(assetId)) fail(`${assetId} is not currently at ${siteCode}`);
        upsertJoin(store, returnManifestId, assetId);
        setAsset(store, assetId, {
          status: 'Ready for Return — Awaiting Collection', stage: 6,
          manifest_id: returnManifestId, manifest_kind: 'return',
        });
        logCustody(store, assetId, `TP6 Empty Collection staged at ${siteCode}`, user.sub);
      }
      const stagedSet = new Set(stagedAssetIds);
      for (const asset of atHub) {
        if (stagedSet.has(asset.id) || !asset.hub_arrival_at) continue;
        const days = ageDays(asset.hub_arrival_at);
        if (days !== null && days >= 7) {
          logException(store, 'Aged at Hub', asset.id, `${asset.id} at hub ${siteCode} for ${days} days — priority collection alert.`);
        }
      }
      return { returnManifestId };
    }),

    // TP7 — DC Return Receipt, plus the Returns Facility alternate.
    tp7ReturnReceipt: (manifestId, scannedAssetIds, destinationCode, isReturnsFacility, key) => touchpoint(['DC'], key, (store, user) => {
      const destination = destinationCode || user.site;
      const manifest = findManifest(store, manifestId);
      if (!manifest || manifest.kind !== 'return' || manifest.stage !== 6) fail('manifest is not ready for TP7');
      const expected = expectedAssetIds(store, manifestId);
      const scannedSet = new Set(scannedAssetIds);

      manifest.destination_dc_code = destination;
      manifest.stage = 7;
      for (const assetId of expected) {
        if (scannedSet.has(assetId)) {
          setAsset(store, assetId, {
            status: isReturnsFacility ? 'Available at Returns Facility' : 'Available at DC',
            stage: 0, home_site_code: destination,
            manifest_id: null, manifest_kind: null, hub_arrival_at: null,
            outstanding_reason: null, outstanding_since: null,
          });
          logCustody(store, assetId, isReturnsFacility
            ? `TP7 Routed to returns facility (${destination})`
            : 'TP7 Return Receipt — chain-of-custody archived', user.sub);
        } else {
          setAsset(store, assetId, { outstanding_reason: 'Outstanding return', outstanding_since: iso(Date.now()) });
          logException(store, 'Overdue Return', assetId, `Dispatched but not returned on manifest ${manifestId}.`);
        }
      }
      return {};
    }),

    /* ---- WSW ---- */
    wsw1Intake: (assetId, key) => touchpoint(['WSW'], key, (store, user) => {
      const asset = findAsset(store, assetId);
      if (!asset) fail(`Unknown asset: ${assetId}`);
      if (asset.status === `At WSW: ${user.site}`) fail('already at WSW here');
      setAsset(store, assetId, {
        status: `At WSW: ${user.site}`, outstanding_reason: null, outstanding_since: null,
        manifest_id: null, manifest_kind: null, transfer_to_code: null,
      });
      logCustody(store, assetId, `WSW Intake — received misrouted stock at ${user.site}`, user.sub);
      return {};
    }),

    wsw2Sort: (assetId, key) => touchpoint(['WSW'], key, (store, user) => {
      const asset = findAsset(store, assetId);
      if (!asset || asset.status !== `At WSW: ${user.site}`) fail('not currently at WSW here');
      setAsset(store, assetId, { status: 'Available at DC', home_site_code: user.site });
      logCustody(store, assetId, 'WSW Sort & Process — released to active DC stock for hub dispatch', user.sub);
      return {};
    }),

    /* ---- non-linear flows ---- */
    damagedScanOut: (assetId, note, key) => touchpoint(['TDT'], key, (store, user) => {
      const asset = findAsset(store, assetId);
      if (!asset) fail(`Unknown asset: ${assetId}`);
      if (asset.status === 'Damaged / Written Off') fail('already marked damaged');
      setAsset(store, assetId, {
        status: 'Damaged / Written Off', stage: 0, outstanding_reason: null, outstanding_since: null,
        manifest_id: null, manifest_kind: null, transfer_to_code: null,
      });
      logCustody(store, assetId, 'Damaged Asset Scan-Out — ' + note, user.sub);
      logException(store, 'Damaged', assetId, `Scanned out as damaged by ${user.sub}: ${note}`);
      return {};
    }),

    maintenanceOut: (assetId, reason, key) => touchpoint(['DC'], key, (store, user) => {
      const asset = findAsset(store, assetId);
      if (!asset || asset.home_site_code !== user.site || asset.status !== 'Available at DC') fail('not available at this DC');
      setAsset(store, assetId, { status: 'In Maintenance', outstanding_reason: null });
      logCustody(store, assetId, 'Maintenance Scan-Out — ' + reason, user.sub);
      return {};
    }),

    maintenanceIn: (assetId, key) => touchpoint(['DC'], key, (store, user) => {
      const asset = findAsset(store, assetId);
      if (!asset || asset.status !== 'In Maintenance') fail('not currently in maintenance');
      setAsset(store, assetId, { status: 'Available at DC', home_site_code: user.site });
      logCustody(store, assetId, 'Maintenance Scan-In — repaired, returned to active fleet', user.sub);
      return {};
    }),

    glsOut: (assetId, glsSite, key) => touchpoint(['DC'], key, (store, user) => {
      const asset = findAsset(store, assetId);
      if (!asset || asset.home_site_code !== user.site || asset.status !== 'Available at DC') fail('not available at this DC');
      setAsset(store, assetId, { status: `With GLS Vendor: ${glsSite}`, outstanding_reason: null });
      logCustody(store, assetId, 'GLS Vendor Custody — transferred to ' + glsSite, user.sub);
      return {};
    }),

    glsIn: (assetId, key) => touchpoint(['DC'], key, (store, user) => {
      const asset = findAsset(store, assetId);
      if (!asset || !asset.status.startsWith('With GLS Vendor')) fail('not currently with GLS');
      setAsset(store, assetId, { status: 'Available at DC', home_site_code: user.site });
      logCustody(store, assetId, 'GLS Vendor Custody — returned to ' + user.site, user.sub);
      return {};
    }),

    interDcOut: (assetId, toSiteCode, key) => touchpoint(['DC'], key, (store, user) => {
      const asset = findAsset(store, assetId);
      if (!asset || asset.home_site_code !== user.site || asset.status !== 'Available at DC') fail('not available at this DC');
      setAsset(store, assetId, {
        status: `Inter-DC Transfer to ${toSiteCode}`, transfer_to_code: toSiteCode, outstanding_reason: null,
      });
      logCustody(store, assetId, 'Inter-DC Transfer — scanned out to ' + toSiteCode, user.sub);
      return {};
    }),

    interDcIn: (assetId, key) => touchpoint(['DC'], key, (store, user) => {
      const asset = findAsset(store, assetId);
      if (!asset || asset.transfer_to_code !== user.site || !asset.status.startsWith('Inter-DC Transfer')) fail('not an inbound transfer here');
      setAsset(store, assetId, { status: 'Available at DC', home_site_code: user.site, transfer_to_code: null });
      logCustody(store, assetId, 'Inter-DC Transfer — received at ' + user.site, user.sub);
      return {};
    }),
  };
}

/** Kept identical to shared/api.js's, so a panel importing it from
 *  either file behaves the same. */
export function newIdempotencyKey() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return 'k-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}
