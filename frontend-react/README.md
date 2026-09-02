# TFS Logistics — React build

**Two separate React apps over one backend.**

```
frontend-react/
  index.html          a signpost page linking to the two apps (no JS)
  serve.js            static dev server (ES modules don't work over file://)

  shared/             the ONLY thing crossing between the two apps
    api.js            the whole backend contract, one copy
    format.js         date / status / CSV helpers (pure, no React)
    tokens.css        the palette + reset + chip/alert/toast primitives
    Toast.js          a genuinely identical UI component
    BarcodeScanner.js the other one — camera capture, ZXing

  scanner/            APP 1 — operators, phone / handheld
    index.html        its own page, its own import map
    app.js            its own React root
    scanner.css       sized for a thumb
    components/       Login · Picker · Panel · ScanInput · useFleet ·
                      TP1–TP7Panel · WSW1Panel · WSW2Panel ·
                      DamagedPanel · MaintPanel · GlsPanel · InterDcPanel

  console/            APP 2 — managers, desktop (no sign-in)
    index.html        its own page, its own import map
    app.js            its own React root
    console.css       sized for a mouse
    components/       Dashboard · Registry · AssetTable · AssetModal · SiteMap ·
                      SiteManager · StatusGrid · ExceptionFeed ·
                      ProcessReference · exportCsv · siteCoords

  src/__verify__/     scanner.test.js · console.test.js · separation.test.js
```

## Why two apps and not one

They are not two views of one product. The scanner is a phone app for a
warehouse operator — log in by role, pick a touch point, scan, submit,
one task at a time. The console is a desktop back-office screen —
tables, filters, a map, CSV exports, site administration. Different
people, different devices, different roles, and **almost no shared UI**
— a toast and the camera capture component, and nothing else.

Forcing them into one app would buy a shared router and cost the
operator a bundle containing the Leaflet map and the table code their
phone will never render. Keeping them apart means a change to the
console cannot break the scanner, and vice versa.

What *is* shared is the part that must never diverge: the backend
contract. `shared/api.js` is one file, imported by both. A renamed
field or a new endpoint is one edit.

**This separation is tested, not just documented.** `separation.test.js`
asserts that neither app imports from the other, that `shared/` never
reaches back into an app, that each app has exactly one `createRoot`,
that no component calls `fetch` behind `api.js`'s back, that both
import maps resolve, that the scanner never loads Leaflet, that the
scanner namespaces its storage keys, and that the console never grows
a sign-in. Those are the things that quietly rot otherwise.

## Running it

```bash
# terminal 1 — the API both apps talk to
cd backend && npm run seed && npm run dev     # http://localhost:4000

# terminal 2 — the two apps
cd frontend-react && npm run serve            # http://localhost:5173
```

Then open **http://localhost:5173/scanner/** or
**http://localhost:5173/console/**.

`serve.js` exists because ES modules and import maps do not load over
`file://` — opening the HTML by double-clicking gives a blank page. In
production these are plain static files; hand the folder to any static
host.

To point at a deployed API, set `window.TFS_API_BASE_URL` before
`app.js` loads (there is a line for it in each `index.html`).

## No JSX, no build step

React 19 removed its UMD/CDN-global builds
([the 2024 upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide#umd-builds-removed)),
so ES modules via an import map is the current recommended way to run
React with zero tooling — which is what each `index.html` does, pointing
at esm.sh. With no bundler available here, JSX has nowhere to compile
to, so every component uses `React.createElement` directly (aliased to
`h`). This is real React — hooks, composition, effects, the actual
reconciler — just without JSX sugar. Adding Vite later is a mechanical
change: the module graph is already correct.

Leaflet and ZXing are the exceptions: both ship UMD, not ES modules, so
each `index.html` loads them with classic `<script>` tags and the
components read `window.L` / `window.ZXing`, each degrading to a
readable message if the global never arrives. Only the console pays for
Leaflet; both apps load ZXing, because the camera *is* the scanner's
barcode input on a phone.

## What's verified, and how

```bash
npm run verify              # all 59
npm run verify:scanner      # 21 — rendering
npm run verify:console      # 27 — rendering + pure logic
npm run verify:separation   # 11 — the architecture itself
```

| Layer | Verified? | How |
|---|---|---|
| Component rendering | **Yes** | The real, locally installed `react-dom/server` renders every component and asserts on the output. Not a mock — the genuine reconciler, running the identical module files the browser loads. |
| Pure logic (rollups, filtering, cycle time, CSV escaping, coordinate fallback) | **Yes** | Unit-tested directly against rows shaped exactly as `backend/schema.sql` returns them — snake_case columns, ISO timestamps. |
| App separation | **Yes** | `separation.test.js`, described above. |
| Backend contract | **Yes, by hand** | Every endpoint both apps call was exercised against the running API: login, dashboard summary, assets, asset detail with custody log, exceptions, manifests, sites, asset creation, site create/delete (including the 409 on a site in use), and a full TP1→TP2 round trip returning the expected `missing` list. |
| Live browser rendering, clicking, camera, map tiles | **No** | Needs a browser with outbound internet to fetch React from esm.sh — the same already-documented limitation as ZXing and Leaflet in the vanilla build. |

## What's ported

**The console is complete** — dashboard, KPIs, status rollups,
filterable asset table, asset detail with full chain of custody, the
Leaflet map, all three CSV exports, the exception feed, asset
registration with camera scan, site onboarding, and the process
reference tables.

One substantive change from `frontend/mercury-console.html`: that
version read a seeded copy of the fleet out of `localStorage`, so two
managers on two machines saw different numbers. **Every figure here
comes from the API.** The rollup counts specifically come from
`GET /api/dashboard/summary`, which computes them server-side over the
whole fleet.

**The console has no sign-in**, exactly like the vanilla version — open
the page and everything is there. The API does require a token on every
read endpoint except `GET /api/sites`, so the console authenticates
itself on load and keeps the token in memory; the manager never sees
it. That opens nothing that was closed: the backend already issues a
token to any name it is given without verifying identity, which is
documented as the one SSO gap to close before real inventory (see
`backend/src/routes/auth.js`). When real auth lands, `console/app.js`'s
one `login()` call is what changes.

The scanner *does* sign in, because it has to know which role and which
site an operator is scanning as.

**The scanner is complete too** — every movement
`frontend/mercury-scanner.html` can perform is here: the seven touch
points, both WSW steps, and the four non-linear flows (damaged
scan-out, maintenance, GLS vendor custody, inter-DC transfer). The
fifth non-linear path, returns-facility routing, lives inside TP7 in
both builds. The picker groups them exactly as the vanilla app does:
numbered steps first, then a dashed **Other movements** section.

Two differences from the vanilla scanner, both deliberate:

- **State comes from the API, not `localStorage`.** The vanilla
  scanner keeps a seeded fleet in the browser, so two phones disagree.
  Every list here — open manifests, what is at this hub, what is in
  maintenance — is read from the backend on entering a panel.
- **Submits carry an idempotency key.** A retry after a dropped
  connection resolves to the original result rather than opening a
  second manifest (see `backend/README.md`).

### The panel pattern

`TP2Panel.js` is the reference: fetch on mount, pick-if-many /
auto-select-if-one, the `useScanBuffer` hook, an idempotency key held
in a ref, and a submit that reports through `onDone`. The flows that
commit one asset at a time (WSW, the non-linear ones) use
`useFleet.js` instead and stay on screen after each scan — an operator
working a pile shouldn't be bounced back to the menu every time.

## The other frontend builds

This project ships three, each with an explicit purpose — see the
top-level `README.md`:

1. `frontend/mercury-scanner.html` — vanilla JS, all 17 actions
   working, and the reference this port was built against.
2. `frontend/reference-integration.html` — a minimal proof the API
   contract works.
3. `frontend-react/` (here) — the React rewrite: both apps complete,
   and the one to operate the business with.
