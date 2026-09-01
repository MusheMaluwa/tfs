# TFS Logistics Backend

A complete, working REST API implementing every touch point, both WSW
steps, and all 5 non-linear flows from the Technical Specification —
not a starter with two examples and a TODO list.

## Why zero npm dependencies

This runs on Node.js 22 built-ins only (`node:sqlite`, `node:http`,
`node:crypto`, `node:test`) — no `npm install` step. That was a
constraint of the environment this was built in (no registry access),
but it's a reasonable engineering choice to keep regardless: fewer
dependencies means a smaller supply-chain surface and a project that
runs identically anywhere Node 22+ exists. See "Moving to the
recommended production stack" below for the swap path to Express /
PostgreSQL / Redis / `jsonwebtoken`, as specified in the Development
Stack and Production Stack Decision Record.

## Setup

```bash
npm run seed    # creates tfs_logistics.db and loads demo data
npm run dev     # starts the API on http://localhost:4000, auto-restarts on change
npm test        # runs the full test suite (19 tests: unit + integration)
```

Check it's alive: `curl http://localhost:4000/api/health`

Get a token: `curl -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"operatorName":"T. Nkosi","role":"DC","siteCode":"JHB-DC1"}'`

## What's implemented (all of it)

- **Every touch point** — TP1 through TP7, including the Returns
  Facility Routing alternate to TP7.
- **Both WSW steps.**
- **All 5 non-linear flows** — Damaged, Maintenance, GLS Custody,
  Inter-DC Transfer (in and out for each).
- **Real auth** — signed session tokens, role enforcement on every
  write endpoint. See `src/lib/auth.js` for the SSO swap point: login
  currently accepts any operator/role/site without verifying identity,
  which is explicitly flagged there and in every prior document as the
  one non-negotiable gap before real inventory touches this.
- **Idempotency** — every touch point endpoint accepts an
  `Idempotency-Key` header; a retried request with the same key returns
  the original result instead of double-processing (tested in
  `api.test.js`).
- **Caching** — dashboard summary is cached with a 20s TTL and
  invalidated on every write, via an interface-compatible in-memory
  cache (`src/lib/cache.js`) that is a contained swap for Redis.
- **19 passing tests** — 11 unit tests against the state machine
  directly, 8 integration tests against a real running HTTP server
  (auth, role enforcement, idempotency, cache behaviour, and a full
  TP1→TP2 request cycle verified over real HTTP).

## API surface

| Endpoint | Method | Auth |
|---|---|---|
| `/api/health` | GET | none |
| `/api/auth/login` | POST | none (issues token) |
| `/api/sites` | GET | any role |
| `/api/sites` | POST | DC |
| `/api/sites/:code` | DELETE | DC |
| `/api/assets` | GET | any role |
| `/api/assets/:id` | GET | any role |
| `/api/assets` | POST | DC |
| `/api/manifests` | GET | any role |
| `/api/manifests/:id` | GET | any role |
| `/api/exceptions` | GET | any role |
| `/api/dashboard/summary` | GET | any role |
| `/api/touchpoints/tp1-open` … `tp7-return-receipt` | POST | role-specific |
| `/api/touchpoints/wsw1-intake`, `wsw2-sort` | POST | WSW |
| `/api/touchpoints/damaged-scan-out` | POST | TDT |
| `/api/touchpoints/maintenance-out`, `maintenance-in` | POST | DC |
| `/api/touchpoints/gls-out`, `gls-in` | POST | DC |
| `/api/touchpoints/interdc-out`, `interdc-in` | POST | DC |

Every touch point request body and response shape mirrors the
`stateMachine.js` function signatures — see that file for exact
parameters.

## Moving to the recommended production stack

Per the Development Stack document and Production Stack Decision
Record, when you have real infrastructure access:

1. **Express**: replace `src/lib/httpApp.js`'s `require` with
   `require('express')` — route files use `router.get/post/delete`
   and `req.params/query/body`, which is the real Express API, so this
   is close to a drop-in swap.
2. **PostgreSQL**: replace `src/db.js`'s `node:sqlite` calls with a
   `pg` Pool exposing the same `get/all/run/transaction` methods —
   nothing outside this file changes.
3. **Redis**: replace `src/lib/cache.js`'s `Map` with an `ioredis`
   client behind the same `get/set/del/delPrefix` interface.
4. **jsonwebtoken**: replace `src/lib/auth.js`'s manual HMAC signing
   with the library — same payload shape.
5. **Real SSO**: replace the body of `POST /api/auth/login` with a
   verification call to your identity provider.

## Tests

```bash
npm test
```

Runs `src/__tests__/stateMachine.test.js` (business logic in
isolation, using an in-memory database) and `src/__tests__/api.test.js`
(the actual HTTP surface, using a real running server on an ephemeral
port). Both run against `node:sqlite` in `:memory:` mode — no setup,
no cleanup needed, no shared state between test files.
