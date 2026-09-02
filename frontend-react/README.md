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
    Toast.js          the one genuinely identical UI component

  scanner/            APP 1 — operators, phone / handheld
    index.html        its own page, its own import map
    app.js            its own React root
    scanner.css       sized for a thumb
    components/       Login · Picker · ScanInput · TP1Panel · TP2Panel · NotPorted

  console/            APP 2 — managers, desktop
    index.html        its own page, its own import map
    app.js            its own React root
    console.css       sized for a mouse
    components/       Dashboard · Registry · AssetTable · AssetModal · SiteMap ·
                      SiteManager · StatusGrid · ExceptionFeed · BarcodeScanner ·
                      ProcessReference · exportCsv · siteCoords

  src/__verify__/     scanner.test.js · console.test.js · separation.test.js
```

## Why two apps and not one

They are not two views of one product. The scanner is a phone app for a
warehouse operator — log in by role, pick a touch point, scan, submit,
one task at a time. The console is a desktop back-office screen —
tables, filters, a map, CSV exports, site administration. Different
people, different devices, different roles, and **no shared UI
components at all**.

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
import maps resolve, that the scanner never loads Leaflet or ZXing, and
that the two apps namespace their `sessionStorage` keys separately.
Those are the things that quietly rot otherwise.

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
`console/index.html` loads them with classic `<script>` tags and the
components read `window.L` / `window.ZXing`, each degrading to a
readable message if the global never arrives. Only the console pays for
them.

## What's verified, and how

```bash
npm run verify              # all 50
npm run verify:scanner      # 13 — rendering
npm run verify:console      # 27 — rendering + pure logic
npm run verify:separation   # 10 — the architecture itself
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

**The scanner has TP1 and TP2**, matching the scope of the original
backend starter — a complete, tested worked example rather than 17
shallow conversions. Every other touch point shows an explicit
"not yet built" panel rather than a dead button.

### Porting the rest

Each remaining touch point already has (a) a working, tested reference
implementation in `frontend/mercury-scanner.html`, and (b) a method
waiting for it in `shared/api.js`. To add one:

1. Copy `scanner/components/TP2Panel.js` — it demonstrates the full
   pattern: fetch on mount, pick-if-many / auto-select-if-one, the
   `useScanBuffer` hook, an idempotency key held in a ref, and a submit
   that reports through `onDone`.
2. Wire it into the `if (activeTP === …)` chain in `scanner/app.js`.
3. Add its id to `PORTED` in the same file so the picker stops marking
   it dashed.

## The other frontend builds

This project ships three, each with an explicit purpose — see the
top-level `README.md`:

1. `frontend/mercury-scanner.html` — vanilla JS, **all 17 actions
   working**, the one to operate the business with today.
2. `frontend/reference-integration.html` — a minimal proof the API
   contract works.
3. `frontend-react/` (here) — the React rewrite: console complete,
   scanner at TP1/TP2 with a documented path for the rest.
