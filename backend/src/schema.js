// src/schema.js
//
// TFS LOGISTICS — Mercury backend schema (MongoDB)
//
// The direct replacement for the old schema.sql, and applied the same
// way: src/db.js runs applySchema() on every boot. Every step is
// idempotent (createCollection swallows NamespaceExists, collMod and
// createIndexes are declarative), so booting against an existing
// database is a no-op and booting against an empty one creates it.
//
// Three things the SQL schema had that MongoDB does not:
//
//   1. FOREIGN KEYS. There is no server-side referential integrity
//      here. It was already being enforced in the application for the
//      cases that matter — routes/auth.js and routes/assets.js reject
//      an unknown site code, routes/sites.js refuses to delete a site
//      an asset or manifest still points at — so nothing silently got
//      worse, but a bad write made outside those routes is no longer
//      caught by the engine. That is the real cost of this migration,
//      stated here rather than discovered later.
//   2. CHECK constraints. Replaced by the $jsonSchema validators below,
//      which the server enforces on insert AND update, so the enum
//      fields ('DC'|'Hub'|'Returns'|'GLS', and so on) are still the
//      database's business and not only the application's.
//   3. Auto-increment ids. custody_log and exceptions used a BIGINT
//      IDENTITY; they now get an ObjectId hex string. The console uses
//      exception ids as React keys only, so the shape change is
//      invisible to it.
//
// Naming: fields stay snake_case, exactly as the SQL columns were. Both
// frontends read `home_site_code`, `outstanding_reason`, `asset_id` and
// friends straight off the JSON, so renaming to camelCase would have
// been a gratuitous break of the API contract.
//
// `_id` is the natural key wherever the table had one — the site code,
// the asset barcode, the manifest id — and is mirrored into a normal
// field (`code`, `id`) so the JSON the API returns is unchanged.
// Nothing ever updates a primary key, so the two cannot drift. Reads
// project `_id` away; see PROJECTION below.

/** Every read defaults to this projection: `_id` duplicates a field
 *  that is already in the document, and leaking it would add a key to
 *  every object both frontends receive. Pass an explicit `projection`
 *  to override. */
const PROJECTION = { _id: 0 };

// Fields that were nullable in SQL must allow null here too: the state
// machine clears them by writing null (`outstanding_reason=NULL`)
// rather than by unsetting them, and a validator runs against the
// document as it will be AFTER the update.
const nullable = (...types) => ({ bsonType: [...types, 'null'] });

// ---------------------------------------------------------------------
// Collections, in the order schema.sql declared the tables.
//
//   key        what src/db.js exposes it as (db.assets, tx.assets, ...)
//   name       the collection name in MongoDB
//   indexes    passed to createIndexes
//   validator  the $jsonSchema standing in for the CHECK constraints
// ---------------------------------------------------------------------
const COLLECTIONS = [
  // -------------------------------------------------------------------
  // Sites: DCs, Hubs, Returns Facilities, GLS vendor sites.
  // `code` is what operators see and select at login.
  // -------------------------------------------------------------------
  {
    key: 'sites',
    name: 'sites',
    indexes: [{ key: { type: 1, name: 1 }, name: 'idx_sites_type_name' }],
    validator: {
      bsonType: 'object',
      required: ['_id', 'code', 'name', 'type', 'created_at'],
      properties: {
        _id: { bsonType: 'string' },
        code: { bsonType: 'string' },         // e.g. 'JHB-DC1', 'Alberton (ALB)'
        name: { bsonType: 'string' },
        type: { enum: ['DC', 'Hub', 'Returns', 'GLS'] },
        lat: nullable('double', 'int'),       // nullable: not every site is geocoded yet
        lng: nullable('double', 'int'),
        created_at: { bsonType: 'date' },
      },
    },
  },

  // -------------------------------------------------------------------
  // Assets: one document per Rolltainer / Hyper Cage.
  // `status` is the human-readable state shown in the UI (e.g.
  // "Available at DC", "At Hub: Alberton (ALB)", "In Maintenance").
  // `stage` is the numeric position in the 7-touch-point loop
  // (0 = idle/available).
  // -------------------------------------------------------------------
  {
    key: 'assets',
    name: 'assets',
    // The scanner's non-linear panels list "what is at my site" on
    // entry; these are the fields those filters key off.
    indexes: [
      // `_id` already carries the barcode, but a sort on `id` cannot
      // use the _id index — and GET /api/assets sorts every listing by
      // it, as does the next-barcode lookup in routes/assets.js.
      // Without this both fall back to an in-memory sort.
      { key: { id: 1 }, name: 'idx_assets_id' },
      { key: { status: 1 }, name: 'idx_assets_status' },
      { key: { manifest_id: 1 }, name: 'idx_assets_manifest' },
      { key: { home_site_code: 1 }, name: 'idx_assets_home_site' },
      { key: { transfer_to_code: 1 }, name: 'idx_assets_transfer_to' },
    ],
    validator: {
      bsonType: 'object',
      required: ['_id', 'id', 'type', 'home_site_code', 'status', 'stage', 'registered_at'],
      properties: {
        _id: { bsonType: 'string' },
        id: { bsonType: 'string' },           // barcode, e.g. 'RT-100001'
        type: { enum: ['Rolltainer', 'Hyper Cage'] },
        home_site_code: { bsonType: 'string' },
        status: { bsonType: 'string' },
        stage: { bsonType: 'int' },
        outstanding_reason: nullable('string'), // null = not outstanding
        outstanding_since: nullable('date'),
        manifest_id: nullable('string'),
        manifest_kind: { enum: ['dispatch', 'return', null] },
        hub_arrival_at: nullable('date'),     // drives the 7-day WSW/hub aging check
        transfer_to_code: nullable('string'), // set during Inter-DC Transfer
        registered_at: { bsonType: 'date' },
      },
    },
  },

  // -------------------------------------------------------------------
  // Manifests: created automatically from what gets scanned at TP1
  // (kind 'dispatch') or TP6 (kind 'return'). `stage` tracks progress:
  // for a dispatch manifest, 1=open(TP1) 2=closed(TP2) 3=tdtIntake(TP3)
  // 4=tdtLoaded(TP4) 5=hubIntake(TP5, dispatch considered complete).
  // For a return manifest: 6=staged(TP6) 7=received(TP7).
  // -------------------------------------------------------------------
  {
    key: 'manifests',
    name: 'manifests',
    // Every scanner panel opens with "which manifests are at my
    // stage?", and the console lists them newest-first.
    indexes: [
      { key: { kind: 1, stage: 1 }, name: 'idx_manifests_kind_stage' },
      { key: { created_at: -1 }, name: 'idx_manifests_created' },
    ],
    validator: {
      bsonType: 'object',
      required: ['_id', 'id', 'kind', 'stage', 'completed_dispatch', 'created_at'],
      properties: {
        _id: { bsonType: 'string' },
        id: { bsonType: 'string' },           // e.g. 'MAN-482913' or 'RET-731004'
        kind: { enum: ['dispatch', 'return'] },
        origin_dc_code: nullable('string'),
        destination_hub_code: nullable('string'),
        origin_hub_code: nullable('string'),
        destination_dc_code: nullable('string'),
        stage: { bsonType: 'int' },
        epod_id: nullable('string'),          // set when TP4 confirms load
        eta: nullable('date'),
        // 0/1, not a boolean: the API's JSON shape is consumed as-is by
        // both frontends, and it was 0/1 under SQL.
        completed_dispatch: { enum: [0, 1] },
        created_at: { bsonType: 'date' },
      },
    },
  },

  // -------------------------------------------------------------------
  // Manifest <-> Asset join: which assets are expected on a manifest,
  // and whether/when each one has actually been scanned at the CURRENT
  // touch point being worked. Persisting it server-side means an
  // in-progress scan session survives a page reload or a device swap.
  //
  // `_id` is `${manifest_id}::${asset_id}` — the composite primary key
  // the SQL table had, which is also what makes the join rows
  // idempotent to re-insert.
  // -------------------------------------------------------------------
  {
    key: 'manifestAssets',
    name: 'manifest_assets',
    indexes: [{ key: { manifest_id: 1, expected: 1 }, name: 'idx_manifest_assets_manifest' }],
    validator: {
      bsonType: 'object',
      required: ['_id', 'manifest_id', 'asset_id', 'expected', 'scanned'],
      properties: {
        _id: { bsonType: 'string' },
        manifest_id: { bsonType: 'string' },
        asset_id: { bsonType: 'string' },
        expected: { enum: [0, 1] },
        scanned: { enum: [0, 1] },
        scanned_at: nullable('date'),
      },
    },
  },

  // -------------------------------------------------------------------
  // Custody log: append-only history of every scan event on an asset,
  // across every touch point and non-linear flow. This is the "Scan
  // history" timeline shown in the console's asset detail modal.
  // -------------------------------------------------------------------
  {
    key: 'custodyLog',
    name: 'custody_log',
    indexes: [{ key: { asset_id: 1, ts: -1 }, name: 'idx_custody_asset_ts' }],
    validator: {
      bsonType: 'object',
      required: ['_id', 'id', 'asset_id', 'ts', 'note'],
      properties: {
        _id: { bsonType: 'string' },
        id: { bsonType: 'string' },
        asset_id: { bsonType: 'string' },
        ts: { bsonType: 'date' },
        note: { bsonType: 'string' },
        operator: nullable('string'),
      },
    },
  },

  // -------------------------------------------------------------------
  // Exceptions: Missed Scan, Unexpected Asset, Missing Asset, Aged at
  // Hub, Overdue Return, Damaged. Feeds the console dashboard's
  // exception feed and the "Exception count" KPI.
  // -------------------------------------------------------------------
  {
    key: 'exceptions',
    name: 'exceptions',
    indexes: [{ key: { ts: -1 }, name: 'idx_exceptions_ts' }],
    validator: {
      bsonType: 'object',
      required: ['_id', 'id', 'ts', 'type', 'asset_id', 'note'],
      properties: {
        _id: { bsonType: 'string' },
        id: { bsonType: 'string' },
        ts: { bsonType: 'date' },
        type: { bsonType: 'string' },
        asset_id: { bsonType: 'string' },
        note: { bsonType: 'string' },
      },
    },
  },

  // -------------------------------------------------------------------
  // Operators: NOT real authentication yet — see the technical spec's
  // "Known gaps". This just gives you a collection to build real auth
  // against (password hash, SSO subject, etc.) instead of the free-text
  // name field the prototype currently uses.
  // -------------------------------------------------------------------
  {
    key: 'operators',
    name: 'operators',
    indexes: [],
    validator: {
      bsonType: 'object',
      required: ['_id', 'id', 'name', 'role', 'created_at'],
      properties: {
        _id: { bsonType: 'string' },
        id: { bsonType: 'string' },
        name: { bsonType: 'string' },
        role: { enum: ['DC', 'TDT', 'Hub', 'WSW', 'Viewer'] },
        site_code: nullable('string'),
        created_at: { bsonType: 'date' },
      },
    },
  },

  // -------------------------------------------------------------------
  // Fleet-wide tagging coverage counters (the console's "77% -> 100%"
  // KPI). Single document, `_id: 1`, updated as assets are registered.
  // -------------------------------------------------------------------
  {
    key: 'fleetCounters',
    name: 'fleet_counters',
    indexes: [],
    validator: {
      bsonType: 'object',
      required: ['_id', 'tagged_fleet', 'total_fleet'],
      properties: {
        _id: { enum: [1] },
        tagged_fleet: { bsonType: 'int' },
        total_fleet: { bsonType: 'int' },
      },
    },
  },
];

const NAMESPACE_EXISTS = 48;

/** Creates every collection, installs its validator and its indexes,
 *  and seeds the singleton fleet_counters document.
 *
 *  Collections are created explicitly rather than left to MongoDB's
 *  implicit creation on first insert, because the first insert is
 *  frequently inside a transaction (TP1 opens a manifest that way) and
 *  creating a collection there is a needless thing to depend on. */
async function applySchema(database) {
  for (const c of COLLECTIONS) {
    const options = { validator: { $jsonSchema: c.validator }, validationLevel: 'strict' };
    try {
      await database.createCollection(c.name, options);
    } catch (err) {
      // Already there — bring its validator up to date instead, which
      // is what makes re-running this on every boot meaningful.
      if (err.code !== NAMESPACE_EXISTS) throw err;
      await database.command({ collMod: c.name, ...options });
    }
    if (c.indexes.length) await database.collection(c.name).createIndexes(c.indexes);
  }
  // The SQL version's `INSERT ... ON CONFLICT (id) DO NOTHING`.
  await database.collection('fleet_counters').updateOne(
    { _id: 1 },
    { $setOnInsert: { tagged_fleet: 0, total_fleet: 0 } },
    { upsert: true }
  );
}

module.exports = { COLLECTIONS, PROJECTION, applySchema };
