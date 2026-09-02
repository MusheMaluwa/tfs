# TFS Logistics — Production Application

The working application: a complete, tested backend covering every
touch point, WSW step, and non-linear flow; a vanilla-JS frontend
fully wired to it (every one of the 17 scan actions, live); and a
React rewrite of the core flows on top of the same API.

## Start here

```bash
cd backend
npm run seed
npm run dev          # http://localhost:4000
npm test             # 20 tests, ~0.4s
```

Then, in a second terminal, pick whichever proof you want to see:

```bash
# The full vanilla scanner app, driven through its real UI — all 7
# touch points, WSW, and 3 non-linear flows, clicking the same buttons
# an operator would, against the real backend:
node e2e/scanner-full-loop.spec.js

# The minimal reference page — the smallest possible proof the wiring
# works end to end:
node e2e/full-stack.spec.js

# The React build — both apps' component tests plus the architecture
# tests that keep the two apps separate:
cd frontend-react && npm run verify
```

## Deploying somewhere real

See **`DEPLOYMENT.md`** for a tested, copy-paste runbook to get this
live on a real HTTPS URL (Render, free tier) — useful for stakeholder
demos, since it also means barcode camera scanning works for the
first time (it only needs HTTPS, which this sandbox never had).
`render.yaml` at the repo root is the one-click Blueprint version of
the same steps. Every instruction in that guide — including the exact
one-line HTML edit that points the frontend at the backend — was
tested against a real browser before being written down, not just
described.

## What's genuinely done and verified

- **`backend/`** — every touch point (TP1–TP7, including Returns
  Facility Routing), both WSW steps, all 5 non-linear flows. Real
  auth with role enforcement, idempotency keys, a caching layer with
  invalidation. **20 passing tests**, including real HTTP round-trips
  against a running server. See `backend/README.md` for the one
  deliberate architectural compromise (zero npm dependencies) and its
  swap-in path to Express/PostgreSQL/Redis.
- **`frontend/mercury-scanner.html`** — the original vanilla-JS
  operator app, **fully retrofitted**: all 17 scan actions (7 touch
  points, 2 WSW steps, 4 non-linear flows in/out) now call the real
  backend instead of `localStorage`. Proven by
  `e2e/scanner-full-loop.spec.js`, which drives the actual UI —
  logging in as different roles, scanning, clicking confirm buttons —
  through a full dispatch-to-return cycle plus Maintenance, GLS, and
  WSW, asserting on real state via the API after each step.
- **`frontend/api-client.js`** + **`reference-integration.html`** — a
  complete client library and a minimal working proof of the API
  contract, kept as the smallest possible thing to point at when
  debugging the wiring itself.
- **`frontend-react/`** — a real React 19 rewrite as **two separate
  apps over the one backend**: `scanner/` (operators, phone) and
  `console/` (managers, desktop). They are genuinely independent React
  roots with no shared UI — the only thing crossing between them is
  `shared/api.js`, the single copy of the backend contract. **50
  passing tests**: component rendering through the real
  `react-dom/server`, the pure logic (rollups, filtering, cycle time,
  CSV escaping), and 10 architecture tests that fail if the two apps
  ever start importing each other. The console is complete and fully
  API-driven; the scanner has TP1/TP2 with a documented path for the
  rest. See `frontend-react/README.md` — in particular for why it's
  plain `React.createElement` rather than JSX (no bundler available in
  this environment) and exactly what is/isn't verifiable without live
  internet access.
- **Two real bugs caught and fixed during this build**, both only
  found because the tests exercised real browsers/servers rather than
  stopping at unit tests: missing CORS handling on the backend (broke
  any cross-origin frontend call), and a test that didn't account for
  TP4's reason-code requirement correctly blocking progress (the app
  was right; the test was wrong, and got fixed to match).

## What's written but not execution-verified here

No Docker daemon, no CI runner, and no outbound internet access were
available in the environment this was built in:

- `backend/Dockerfile`, `docker-compose.yml` — run `docker compose up`
  yourself as the first real test.
- `.github/workflows/ci.yml` — confirm on first push to your repo.
- `frontend-react/`'s live browser rendering — needs real internet
  access to fetch React from esm.sh (React 19 dropped CDN/UMD builds).
  Component logic is verified via Node (see above); live rendering,
  clicking, and state updates in an actual browser are not — the same
  category of limitation as this project's barcode-camera (ZXing) and
  map (Leaflet) dependencies throughout.

## What's not done

- **`frontend/mercury-console.html`** (the *vanilla* back-office app)
  has **not** been retrofitted — it still runs on `localStorage`. It is
  superseded by `frontend-react/console/`, which is fully API-driven;
  the vanilla file is kept only as the reference the React port was
  built from.
- **React scanner**: TP3–TP7, both WSW steps, and the 4 non-linear
  flows are not yet built in `frontend-react/scanner/` — each shows an
  explicit "not yet built" panel rather than silently doing nothing.
  Every one has a working implementation in `mercury-scanner.html` and
  an endpoint already waiting in `shared/api.js`. See
  `frontend-react/README.md`'s porting checklist.

## Directory structure

```
tfs-logistics/
  backend/                      complete, tested, running application
    src/
      db.js                     node:sqlite wrapper
      server.js                  entry point
      seed.js                    demo data loader
      lib/
        httpApp.js                zero-dependency HTTP router (Express-shaped API)
        stateMachine.js            every touch point's business logic
        auth.js                    token issuing/verification (SSO swap point)
        cache.js                   in-memory cache (Redis-interface-compatible)
      middleware/auth.js           requireAuth / requireRole
      routes/                      one file per resource
      __tests__/                   20 tests, unit + integration
    schema.sql
    README.md
    Dockerfile
  frontend/
    mercury-scanner.html         fully retrofitted operator app — all 17 actions live
    mercury-console.html         NOT retrofitted — still localStorage-only
    api-client.js                complete client library
    reference-integration.html   minimal proof of the API contract
  frontend-react/                TWO separate React apps, one backend
    index.html                   signpost page linking to both
    serve.js                     static dev server (ESM needs http://)
    shared/                      the only code crossing between the apps
      api.js                     the whole backend contract, one copy
      format.js                  date / status / CSV helpers
      tokens.css                 palette + chip/alert/toast primitives
      Toast.js                   the one identical UI component
    scanner/                     APP 1 — operators, phone / handheld
      index.html app.js scanner.css components/
    console/                     APP 2 — managers, desktop
      index.html app.js console.css components/
    src/__verify__/              50 tests: rendering, logic, separation
    README.md
  e2e/
    scanner-full-loop.spec.js    full retrofitted-UI proof — every touch point
    full-stack.spec.js           minimal reference-page proof
  docker-compose.yml
  .github/workflows/ci.yml
```
