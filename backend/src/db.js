// src/db.js
//
// PostgreSQL. One dialect, two ways of reaching an engine:
//
//   DATABASE_URL set   -> node-postgres (`pg`) Pool against a real
//                         server. This is the production path, and what
//                         docker-compose.yml wires up.
//   DATABASE_URL unset -> PGlite: the actual PostgreSQL engine compiled
//                         to WebAssembly, running in-process against a
//                         directory (or memory). Not an emulation and
//                         not a different dialect — it is Postgres, so
//                         `npm test` and a first local run need no
//                         server, no Docker, and no install step, the
//                         way the old SQLite file did.
//
// Everything above this file talks to get/all/run/transaction and never
// to a driver, which is what made replacing SQLite a change to one file
// plus an `await` on each call.
//
// Two things did have to change outside it, and both are real:
//
//   1. Every call is async now. A network round-trip cannot be made to
//      look synchronous, and pretending otherwise (worker threads and
//      Atomics.wait) would be a far worse trade than an `await`.
//   2. `transaction(fn)` hands `fn` an executor. A pool hands out a
//      different connection per query, so BEGIN on one and INSERT on
//      another would silently write outside the transaction. Statements
//      inside a transaction MUST go through the passed-in `tx`.

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');
const DATABASE_URL = process.env.DATABASE_URL || '';
// Where the embedded engine keeps its data when there is no server.
// ':memory:' (what the tests use) gets a fresh database per process.
const PGLITE_PATH = process.env.PGLITE_PATH || path.join(__dirname, '..', '.pgdata');

/** Rewrites the codebase's `?` placeholders into Postgres `$1, $2, …`.
 *
 *  Doing it here rather than in ~100 call sites keeps every route's SQL
 *  readable and diff-free. Quoted text is skipped, so a `?` inside a
 *  string literal or a quoted identifier stays a literal `?`. */
function toPgPlaceholders(sql) {
  let out = '';
  let n = 0;
  let quote = null; // "'" or '"' while inside one
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (quote) {
      out += c;
      // '' and "" are escaped quotes inside a literal, not the end of it.
      if (c === quote) {
        if (sql[i + 1] === quote) { out += sql[i + 1]; i += 1; } else { quote = null; }
      }
      continue;
    }
    if (c === "'" || c === '"') { quote = c; out += c; continue; }
    if (c === '?') { n += 1; out += '$' + n; continue; }
    out += c;
  }
  return out;
}

/** The one shape the rest of the codebase sees, over either driver. */
function makeExecutor(query) {
  return {
    async get(sql, params = []) {
      const { rows } = await query(sql, params);
      return rows[0];
    },
    async all(sql, params = []) {
      const { rows } = await query(sql, params);
      return rows;
    },
    async run(sql, params = []) {
      const res = await query(sql, params);
      // `changes` is kept as an alias so the SQLite-era check in
      // routes/sites.js (`result.changes === 0` -> 404) reads the same.
      return { rowCount: res.rowCount, changes: res.rowCount, rows: res.rows };
    },
  };
}

let backend = null; // { kind, query, transaction, close }
let readyPromise = null;

async function initPg() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DATABASE_URL });
  const query = async (sql, params) => pool.query(toPgPlaceholders(sql), params);

  return {
    kind: 'pg',
    query,
    // Multi-statement scripts (schema.sql) cannot go through the
    // extended/prepared protocol. Passing no values makes node-postgres
    // use the simple query protocol, which accepts them.
    exec: (sql) => pool.query(sql),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = makeExecutor((sql, params) => client.query(toPgPlaceholders(sql), params));
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function initPglite() {
  // PGlite is ESM-only; this file is CommonJS. The dynamic import is
  // fine because initialisation is asynchronous either way.
  //
  // It is a devDependency on purpose: a production install (`npm ci
  // --omit=dev`) ships only `pg`, because a real deployment points at a
  // real server. Landing here in production therefore means DATABASE_URL
  // was never set, and that is what the error should say — not
  // ERR_MODULE_NOT_FOUND.
  let PGlite;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
  } catch (err) {
    throw new Error(
      'DATABASE_URL is not set, and the embedded Postgres (@electric-sql/pglite) is not installed. '
      + 'Set DATABASE_URL to point at your PostgreSQL server, or run `npm install` with dev dependencies '
      + 'for a serverless local database.'
    );
  }
  const dataDir = PGLITE_PATH === ':memory:' ? undefined : PGLITE_PATH;
  const isNew = dataDir ? !fs.existsSync(dataDir) : true;
  const pg = await PGlite.create(dataDir);
  const query = async (sql, params) => {
    const res = await pg.query(toPgPlaceholders(sql), params);
    return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
  };

  if (isNew && dataDir) {
    console.log(`[db] created a new embedded Postgres at ${dataDir} — run "npm run seed" to load demo data.`);
  }

  return {
    kind: 'pglite',
    query,
    exec: (sql) => pg.exec(sql),
    async transaction(fn) {
      // PGlite drives one connection, so its own transaction helper is
      // the equivalent of checking a client out of the pool.
      return pg.transaction(async (txClient) => fn(makeExecutor(async (sql, params) => {
        const res = await txClient.query(toPgPlaceholders(sql), params);
        return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
      })));
    },
    close: () => pg.close(),
  };
}

async function init() {
  backend = DATABASE_URL ? await initPg() : await initPglite();
  // Idempotent: every statement in schema.sql is IF NOT EXISTS / ON
  // CONFLICT DO NOTHING, so this runs safely on every boot and doubles
  // as the migration step for a fresh server.
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await backend.exec(schema);
  return backend;
}

/** Resolves once the schema is applied. server.js awaits this before it
 *  listens; the tests await it before they seed. */
function ready() {
  if (!readyPromise) readyPromise = init();
  return readyPromise;
}

const base = makeExecutor(async (sql, params) => {
  await ready();
  return backend.query(sql, params);
});

const db = {
  ...base,
  ready,
  /** Runs `fn` inside a transaction, rolling back on throw.
   *
   *  `fn` receives the executor to use — every statement that must be
   *  part of the transaction has to go through it, not through the
   *  module-level `db`, which would take a different connection. */
  async transaction(fn) {
    await ready();
    return backend.transaction(fn);
  },
  async close() {
    if (readyPromise) {
      await readyPromise;
      await backend.close();
      readyPromise = null;
      backend = null;
    }
  },
  /** Which engine answered — surfaced by GET /api/health. */
  kind: () => (backend ? backend.kind : null),
  _toPgPlaceholders: toPgPlaceholders, // exported for its unit test
};

module.exports = db;
