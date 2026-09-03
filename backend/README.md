# TFS Logistics Backend

A complete, working REST API implementing every touch point, both WSW
steps, and all 5 non-linear flows from the Technical Specification —
not a starter with two examples and a TODO list.

## The database

**MongoDB**, reached one of two ways — same engine, same query
language, same driver-facing code path:

| `MONGODB_URI` | Deployment | Used for |
|---|---|---|
| set | the official [`mongodb`](https://www.mongodb.com/docs/drivers/node/) driver against your cluster | production, `docker compose up` |
| unset | [mongodb-memory-server](https://github.com/typegoose/mongodb-memory-server) — a real `mongod` started in a temp directory | `npm test`, and a first local run |

The in-process option is not a mock or a compatibility layer: it is the
actual `mongod` binary, so a query that works in the test suite works
against a real cluster. It exists so that cloning this repository and
running `npm test` needs no container and no service — the same
zero-setup start the embedded PostgreSQL used to give.

**It is started as a single-node REPLICA SET, not a standalone.** That
is not incidental. Multi-document transactions require a replica set,
and every touch point in `src/lib/stateMachine.js` runs inside one; a
standalone `mongod` would connect happily and then fail on the first
scan. The same applies to `docker-compose.yml` (`--replSet rs0`) and to
CI. MongoDB Atlas is always a replica set, so production needs nothing
extra.

| Where | Deployment |
|---|---|
| Atlas (production) | replica set, managed |
| `npm test` | single-node replica set, in a temp directory |
| `docker-compose.yml` | `mongo:8` with `--replSet rs0` |
| CI | `mongo:8` with `--replSet rs0` |

`src/schema.js` is applied on every boot — it creates each collection,
installs its `$jsonSchema` validator and its indexes, and seeds the
singleton `fleet_counters` document. Every step converges on the same
state, so it is safe to re-run and doubles as the migration step
against a fresh cluster. The first destructive change — a removed
field, a retyped one — is the point to put a real migration tool in
front of it.

Two things the SQL schema had that this one does not, both stated at
the top of `src/schema.js`:

- **No foreign keys.** Referential integrity is the application's job
  now. It already was for the cases that matter (an unknown site code
  is rejected at login and at asset registration; a site in use cannot
  be deleted), but a bad write made outside those routes is no longer
  caught by the engine. This is the real cost of the move and it is
  worth knowing before you write a new route.
- **No CHECK constraints as such.** They survive as `$jsonSchema`
  validators, which the server enforces on insert *and* update — so
  the enum fields are still the database's business and not only the
  application's. `stateMachine.test.js` asserts this directly rather
  than leaving it as a claim in a comment.

`GET /api/health` reports which deployment answered and which database
name it is using, so "it's up" and "it's talking to the database you
think it is" are separate answers.

## Why (almost) zero npm dependencies

Everything except the database driver runs on Node.js 22 built-ins —
`node:http`, `node:crypto`, `node:test` — with no framework, no ODM and
no test runner to install. `mongodb` is the one runtime dependency,
because MongoDB speaks a binary wire protocol and Node has no client
for it built in. See "Moving to the rest of the production stack" below
for Express / Redis / `jsonwebtoken`.

## Setup

```bash
npm install     # mongodb, plus the in-process server for local dev and tests
npm run dev     # starts the API on http://localhost:4000, auto-restarts on change
npm test        # the full suite (25 tests: unit + integration)
```

`npm run seed` loads demo data, but it needs somewhere for that data to
live. The in-process server is thrown away when the process exits, so
seeding it accomplishes nothing — unlike the embedded PostgreSQL this
replaced, there is no on-disk data directory. `seed.js` says so out
loud rather than exiting 0 and looking like it worked. Point at a real
deployment first:

```bash
# backend/.env already has these; fill in the password there and every
# npm script picks them up automatically via --env-file-if-exists.
export MONGODB_URI='mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?appName=Cluster0'
export MONGODB_DB=tfs_logistics
npm run seed && npm run dev
```

`docker compose up` (from the repository root) starts a local MongoDB
replica set, the API and Redis together with `MONGODB_URI` already
wired.

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
- **25 passing tests** — 15 unit tests against the state machine
  directly, 10 integration tests against a real running HTTP server
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
parameters. The JSON field names are unchanged from the SQL version
(`home_site_code`, `outstanding_reason`, `asset_id`, …): both frontends
read them straight off the response, so the move to MongoDB kept
snake_case rather than breaking the API contract for cosmetics.

## Moving to the rest of the production stack

MongoDB is done. Per the Development Stack document and Production
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
npm test        # 25 tests against a real mongod started in-process
```

`src/__tests__/stateMachine.test.js` covers the business logic
directly; `src/__tests__/api.test.js` covers the HTTP surface against a
real server on an ephemeral port. Each file runs in its own process
with its own `mongod`, so there is no setup, no cleanup and no shared
state between them.

To run the identical suite against a real deployment:

```bash
MONGODB_URI='mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/' MONGODB_DB=tfs_test npm run test:atlas
```

`test:atlas` runs the files sequentially, because both suites reset the
same collections and one server is shared between them. It also refuses
to run without both variables set explicitly in your shell — it
deliberately does not read `backend/.env`, because the point of the
guard is that you say per run which deployment you are about to empty.

**Use a throwaway database: the suites delete every document on
entry.** That is enforced in code, not only in this paragraph —
`src/__tests__/helpers/reset.js` throws unless the database name ends
in `_test`. A separate database inside the same Atlas cluster is the
easiest throwaway; Atlas creates it on first write.

### Writing a query

Route and state-machine code goes through the collection wrappers in
`src/db.js` (`db.assets`, `db.manifests`, …) rather than the driver's
own `Collection` objects. They are the driver's API with two deliberate
differences, plus two rules the compiler cannot enforce for you:

- **`find()` resolves to an array, not a cursor.** Every caller here
  wants the whole result, and `.toArray()` on all of them was noise.
- **Reads default to the `_id: 0` projection.** `_id` duplicates a
  field already in the document (`code`, `id`), and leaking it would
  add a key to every object both frontends receive. Pass an explicit
  `projection` to get it back.
- **Everything is awaited.**
- **Inside `db.transaction(fn)`, use the `tx` it hands you** — not the
  module-level `db`. The module-level accessors are bound to no
  session, so a write issued through `db` would commit on its own and
  survive a rollback. `stateMachine.js` threads `tx` through every
  helper for exactly this reason, and `stateMachine.test.js` asserts
  the plumbing directly rather than trusting it.
