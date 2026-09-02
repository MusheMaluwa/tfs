# TFS Logistics Backend

A complete, working REST API implementing every touch point, both WSW
steps, and all 5 non-linear flows from the Technical Specification —
not a starter with two examples and a TODO list.

## The database

**PostgreSQL**, reached one of two ways — same dialect, same SQL, same
driver-facing code path:

| `DATABASE_URL` | Engine | Used for |
|---|---|---|
| set | [`pg`](https://node-postgres.com) Pool against your server | production, `docker compose up` |
| unset | [PGlite](https://pglite.dev) — PostgreSQL compiled to WebAssembly, in-process, storing to `backend/.pgdata` | `npm test`, and a first local run |

PGlite is not an emulation or a compatibility layer: it is the actual
PostgreSQL engine, so a query that works in the test suite works
against a real server. It exists here so that cloning this repository
and running `npm test` needs no container, no service and no
`initdb` — the same zero-setup start the SQLite file used to give,
without the dialect drift that came with it.

**Everything is PostgreSQL 18.** Not incidentally — a version skew
between what CI runs and what production runs is how a query passes
review and fails on deploy:

| Where | Version |
|---|---|
| Neon (production) | 18.x |
| PGlite (`npm test`) | 18.x |
| `docker-compose.yml` | `postgres:18-alpine` |
| CI service containers | `postgres:18-alpine` |

Check what a server is actually running with `SELECT version()`, or
`GET /api/health`, which names the engine that answered.

`schema.sql` is applied on every boot. Every statement is
`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`, so it is safe to re-run and
doubles as the migration step against a fresh server. The first
destructive change — a dropped column, a retyped one — is the point to
put a real migration tool in front of it.

`GET /api/health` reports which engine answered, so "it's up" and "it's
talking to the database you think it is" are separate answers.

## Why (almost) zero npm dependencies

Everything except the database driver runs on Node.js 22 built-ins —
`node:http`, `node:crypto`, `node:test` — with no framework, no ORM and
no test runner to install. `pg` is the one runtime dependency, because
PostgreSQL speaks a binary wire protocol and Node has no client for it
built in. See "Moving to the rest of the production stack" below for
Express / Redis / `jsonwebtoken`.

## Setup

```bash
npm install     # pg, plus the embedded database for local dev and tests
npm run seed    # loads demo data (safe to re-run)
npm run dev     # starts the API on http://localhost:4000, auto-restarts on change
npm test        # the full suite (23 tests: unit + integration)
```

To point at a real PostgreSQL instead:

```bash
export DATABASE_URL=postgres://tfs:tfs@localhost:5432/tfs_logistics
npm run seed && npm run dev
```

`docker compose up` (from the repository root) starts that server, the
API and Redis together with `DATABASE_URL` already wired.

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

## Moving to the rest of the production stack

PostgreSQL is done. Per the Development Stack document and Production
Stack Decision Record, the remaining swaps are:

1. **Express**: replace `src/lib/httpApp.js`'s `require` with
   `require('express')` — route files use `router.get/post/delete`
   and `req.params/query/body`, which is the real Express API, so this
   is close to a drop-in swap.
2. **Redis**: replace `src/lib/cache.js`'s `Map` with an `ioredis`
   client behind the same `get/set/del/delPrefix` interface.
3. **jsonwebtoken**: replace `src/lib/auth.js`'s manual HMAC signing
   with the library — same payload shape.
4. **Real SSO**: replace the body of `POST /api/auth/login` with a
   verification call to your identity provider.

## Tests

```bash
npm test        # 23 tests against the embedded PostgreSQL
```

`src/__tests__/stateMachine.test.js` covers the business logic
directly; `src/__tests__/api.test.js` covers the HTTP surface against a
real server on an ephemeral port. Both run on
`PGLITE_PATH=':memory:'` — a fresh PostgreSQL per file, so there is no
setup, no cleanup and no shared state between them.

To run the identical suite against a real PostgreSQL server:

```bash
DATABASE_URL=postgres://tfs:tfs@localhost:5432/tfs_test npm run test:pg
```

`test:pg` runs the files sequentially, because both suites reset the
same tables and one server is shared between them. Use a throwaway
database: the suites `TRUNCATE` on entry.

### Writing a query

Route and state-machine code uses `?` placeholders; `src/db.js`
rewrites them to `$1, $2, …` so that the SQL stays readable and the
same string works whichever driver is behind it. Two rules the
compiler cannot enforce for you:

- **Everything is awaited.** `db.get/all/run` return promises.
- **Inside `db.transaction(fn)`, use the `tx` it hands you** — not the
  module-level `db`. A pool gives a different connection per query, so
  a statement issued through `db` would commit on its own and survive a
  rollback. `stateMachine.js` threads `tx` through every helper for
  exactly this reason.
