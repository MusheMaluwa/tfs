// src/db.js
//
// MongoDB. One driver, two ways of reaching a server:
//
//   MONGODB_URI set   -> the official `mongodb` driver against that
//                        deployment. This is the production path, and
//                        what backend/.env and docker-compose.yml wire
//                        up (MongoDB Atlas: mongodb+srv://...).
//   MONGODB_URI unset -> mongodb-memory-server starts a real mongod as
//                        a single-node REPLICA SET in a temp directory
//                        and this file connects to that. Not a mock and
//                        not a different query language — it is mongod,
//                        so `npm test` and a first local run need no
//                        server and no Docker, the way the embedded
//                        Postgres did before it.
//
// The replica set matters: multi-document transactions require one, and
// the touch-point state machine leans on them heavily. A standalone
// mongod would pass most of the suite and then fail on every TP.
//
// Everything above this file talks to the collection wrappers below and
// never to the driver directly. The wrappers exist for one reason: they
// inject the session. A statement inside db.transaction() that went to
// the raw driver without the session would commit on its own and
// survive a rollback, so `tx.assets` and `db.assets` are different
// objects and passing the executor explicitly — the `x` first argument
// throughout lib/stateMachine.js — is what makes that mistake hard to
// write by accident rather than merely discouraged.
//
// Two deviations from the driver's own API, both deliberate:
//
//   1. `find()` resolves to an ARRAY, not a cursor. Every caller in
//      this codebase wants the whole result; `.toArray()` on all of
//      them was noise.
//   2. Reads default to the `_id: 0` projection (see src/schema.js).
//      Pass an explicit `projection` to get it back.

const { MongoClient, ObjectId } = require('mongodb');
const { COLLECTIONS, PROJECTION, applySchema } = require('./schema');

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'tfs_logistics';

/** Wraps one driver Collection so that every call carries the
 *  transaction's session (when there is one) and the default
 *  projection (when the caller did not ask for another). */
function wrapCollection(collection, session) {
  const opts = (options) => (session ? { ...options, session } : options);
  const read = (options) => {
    const withSession = opts(options);
    return 'projection' in withSession ? withSession : { ...withSession, projection: PROJECTION };
  };
  return {
    name: collection.collectionName,
    /** Resolves to an array, not a cursor — see the file header. */
    find: (filter = {}, options = {}) => collection.find(filter, read(options)).toArray(),
    findOne: (filter = {}, options = {}) => collection.findOne(filter, read(options)),
    countDocuments: (filter = {}, options = {}) => collection.countDocuments(filter, opts(options)),
    insertOne: (doc, options = {}) => collection.insertOne(doc, opts(options)),
    insertMany: (docs, options = {}) => collection.insertMany(docs, opts(options)),
    updateOne: (filter, update, options = {}) => collection.updateOne(filter, update, opts(options)),
    updateMany: (filter, update, options = {}) => collection.updateMany(filter, update, opts(options)),
    deleteOne: (filter, options = {}) => collection.deleteOne(filter, opts(options)),
    deleteMany: (filter, options = {}) => collection.deleteMany(filter, opts(options)),
    aggregate: (pipeline, options = {}) => collection.aggregate(pipeline, opts(options)).toArray(),
    /** Escape hatch to the driver's own Collection. Anything reached
     *  through this inside a transaction must be passed the session by
     *  hand — that is the whole reason the wrappers exist. */
    raw: collection,
  };
}

/** The one shape the rest of the codebase sees, bound either to no
 *  session (the module-level `db`) or to a transaction's. */
function makeExecutor(database, session) {
  const x = { session: session || null };
  for (const c of COLLECTIONS) x[c.key] = wrapCollection(database.collection(c.name), session);
  return x;
}

let backend = null; // { kind, client, database, executor, memoryServer }
let readyPromise = null;

async function initServer() {
  const client = new MongoClient(MONGODB_URI, {
    // Fail fast and loudly rather than hanging: a wrong Atlas password
    // or an IP that is not on the access list should surface as a
    // startup error in seconds, not a request that never answers.
    serverSelectionTimeoutMS: Number(process.env.MONGODB_TIMEOUT_MS) || 10000,
  });
  await client.connect();
  return { kind: 'mongodb', client, memoryServer: null };
}

async function initMemory() {
  // mongodb-memory-server is a devDependency on purpose: a production
  // install (`npm ci --omit=dev`) ships only `mongodb`, because a real
  // deployment points at a real server. Landing here in production
  // therefore means MONGODB_URI was never set, and that is what the
  // error should say — not ERR_MODULE_NOT_FOUND.
  let MongoMemoryReplSet;
  try {
    ({ MongoMemoryReplSet } = require('mongodb-memory-server'));
  } catch {
    throw new Error(
      'MONGODB_URI is not set, and the in-process MongoDB (mongodb-memory-server) is not installed. '
      + 'Set MONGODB_URI to point at your MongoDB deployment, or run `npm install` with dev dependencies '
      + 'for a serverless local database.'
    );
  }
  // One node, but a replica set: transactions need an oplog.
  const memoryServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = new MongoClient(memoryServer.getUri());
  await client.connect();
  return { kind: 'mongodb-memory', client, memoryServer };
}

async function init() {
  const started = MONGODB_URI ? await initServer() : await initMemory();
  const database = started.client.db(MONGODB_DB);
  // Idempotent: createCollection/collMod/createIndexes all converge on
  // the same state, so this runs safely on every boot and doubles as
  // the migration step for a fresh deployment.
  await applySchema(database);
  backend = { ...started, database, executor: makeExecutor(database, null) };
  return backend;
}

/** Resolves once the schema is applied. server.js awaits this before it
 *  listens; the tests await it before they seed. */
function ready() {
  if (!readyPromise) readyPromise = init();
  return readyPromise;
}

/** Module-level collection accessors. Each method awaits ready() first,
 *  so a handler never has to care whether the connection is up yet. */
function lazyCollection(key) {
  const methods = ['find', 'findOne', 'countDocuments', 'insertOne', 'insertMany',
    'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'aggregate'];
  const out = {};
  for (const m of methods) {
    out[m] = async (...args) => {
      await ready();
      return backend.executor[key][m](...args);
    };
  }
  return out;
}

const db = {
  ready,

  /** A fresh id for the two collections that had a BIGINT IDENTITY.
   *  An ObjectId hex string rather than the ObjectId itself, so it
   *  survives JSON.stringify as the same value it is stored as. */
  newId: () => new ObjectId().toHexString(),

  /** Cheap "is the database actually reachable" probe for /api/health.
   *  A ping, not a query, so it says nothing about the schema — which
   *  is the right scope for a health check. */
  async ping() {
    await ready();
    await backend.database.command({ ping: 1 });
  },

  /** Runs `fn` inside a multi-document transaction, rolling back on
   *  throw.
   *
   *  `fn` receives the executor to use — every write that must be part
   *  of the transaction has to go through it, not through the
   *  module-level `db`, which is bound to no session and would commit
   *  immediately.
   *
   *  Note the driver may run `fn` more than once: withTransaction
   *  retries on a transient error. Everything passed to it here is
   *  written to be safe to re-run from a clean slate, which is what an
   *  aborted attempt leaves behind. */
  async transaction(fn) {
    await ready();
    const session = backend.client.startSession();
    try {
      return await session.withTransaction(() => fn(makeExecutor(backend.database, session)));
    } finally {
      await session.endSession();
    }
  },

  async close() {
    if (readyPromise) {
      await readyPromise;
      await backend.client.close();
      if (backend.memoryServer) await backend.memoryServer.stop();
      readyPromise = null;
      backend = null;
    }
  },

  /** Which deployment answered — surfaced by GET /api/health. */
  kind: () => (backend ? backend.kind : null),

  /** The database name in use, so a caller can tell a test database
   *  from a production one before it deletes anything. */
  name: () => MONGODB_DB,
};

for (const c of COLLECTIONS) db[c.key] = lazyCollection(c.key);

module.exports = db;
