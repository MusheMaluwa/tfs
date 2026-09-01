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

# The React build's component-rendering tests:
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
- **`frontend-react/`** — a real React 19 rewrite (hooks, real
  `react-dom/server`-verified components) of the same app. TP1 and TP2
  are fully ported and tested (9 passing tests); the rest follow a
  documented pattern. See `frontend-react/README.md` — in particular
  for why it's plain `React.createElement` rather than JSX (no bundler
  available in this environment) and exactly what is/isn't verifiable
  without live internet access.
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

- **`mercury-console.html`** (the back-office dashboard app) has
  **not** been retrofitted — it still runs on `localStorage`. The
  scanner app above was the priority; the console app would follow an
  identical pattern (see `TECHNICAL-SPEC.md §7` for its function-level
  mapping) but wasn't attempted in this pass.
- **React**: TP3–TP7, both WSW steps, and the 4 non-linear flows are
  not yet ported to `frontend-react/` — each shows an explicit "not
  yet ported" placeholder rather than silently doing nothing. See
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
  frontend-react/
    index.html                   ESM/import-map shell, no build step
    app.js                       top-level component, session + routing
    components.js                Login, Picker, TP1Panel, TP2Panel
    api.js                       ESM API client
    src/__verify__/               9 tests via real react-dom/server
    README.md
  e2e/
    scanner-full-loop.spec.js    full retrofitted-UI proof — every touch point
    full-stack.spec.js           minimal reference-page proof
  docker-compose.yml
  .github/workflows/ci.yml
```
