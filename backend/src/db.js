// src/db.js
//
// Uses Node's built-in `node:sqlite` (stable-enough experimental module,
// Node 22.5+) instead of the `better-sqlite3` npm package — this project
// runs with zero `npm install` step, which matters in restricted/offline
// environments and removes a dependency's supply chain from the audit
// surface. The API (prepare().run/get/all, exec) is close enough to
// better-sqlite3 that swapping back is a small, contained change if
// preferred.
//
// For production PostgreSQL (per Solution Architecture §5), replace this
// file with a `pg` Pool-based adapter exposing the same three methods
// used throughout the codebase: get(sql, params), all(sql, params),
// run(sql, params). Nothing outside this file needs to change.

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'tfs_logistics.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');

const isNewDb = DB_PATH === ':memory:' || !fs.existsSync(DB_PATH);
const raw = new DatabaseSync(DB_PATH);
raw.exec('PRAGMA foreign_keys = ON');
raw.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

if (isNewDb && DB_PATH !== ':memory:') {
  console.log(`[db] created new database at ${DB_PATH} — run "npm run seed" to load demo data.`);
}

/** Thin, driver-agnostic wrapper. Every route/lib file talks to this, not to node:sqlite directly. */
const db = {
  get(sql, params = []) {
    return raw.prepare(sql).get(...params);
  },
  all(sql, params = []) {
    return raw.prepare(sql).all(...params);
  },
  run(sql, params = []) {
    return raw.prepare(sql).run(...params);
  },
  /** Runs `fn` inside a transaction; rolls back on throw. */
  transaction(fn) {
    raw.exec('BEGIN');
    try {
      const result = fn();
      raw.exec('COMMIT');
      return result;
    } catch (err) {
      raw.exec('ROLLBACK');
      throw err;
    }
  },
  close() {
    raw.close();
  },
};

module.exports = db;
