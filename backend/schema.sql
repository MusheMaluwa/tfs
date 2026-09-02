-- =====================================================================
-- TFS LOGISTICS — Mercury backend schema (PostgreSQL)
--
-- Applied on every boot by src/db.js. Every statement is IF NOT EXISTS
-- or ON CONFLICT DO NOTHING, so booting against an existing database is
-- a no-op and booting against an empty one creates it. That is enough
-- while the schema only grows; the first destructive change (a dropped
-- column, a retyped one) is the point to put a real migration tool in
-- front of this file rather than editing it in place.
--
-- Timestamps are TIMESTAMPTZ, not text. The SQLite version stored two
-- different formats in the same columns — `datetime('now')` produced
-- "2026-09-02 11:02:56" with no zone while the application wrote ISO
-- strings ending in Z — and `new Date()` in the browser reads the first
-- of those as LOCAL time. Postgres normalises both on the way in, so
-- every timestamp the API returns is now unambiguously UTC.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sites: DCs, Hubs, Returns Facilities, GLS vendor sites.
-- `code` is what operators see and select at login.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sites (
  code        TEXT PRIMARY KEY,             -- e.g. 'JHB-DC1', 'Alberton (ALB)'
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('DC','Hub','Returns','GLS')),
  lat         DOUBLE PRECISION,             -- nullable: not every site is geocoded yet
  lng         DOUBLE PRECISION,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Assets: one row per Rolltainer / Hyper Cage.
-- `status` is the human-readable state shown in the UI (e.g. "Available
-- at DC", "At Hub: Alberton (ALB)", "In Maintenance"). `stage` is the
-- numeric position in the 7-touch-point loop (0 = idle/available).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assets (
  id                 TEXT PRIMARY KEY,       -- barcode, e.g. 'RT-100001'
  type               TEXT NOT NULL CHECK (type IN ('Rolltainer','Hyper Cage')),
  home_site_code     TEXT NOT NULL REFERENCES sites(code),
  status             TEXT NOT NULL DEFAULT 'Available at DC',
  stage              INTEGER NOT NULL DEFAULT 0,
  outstanding_reason TEXT,                   -- NULL = not outstanding
  outstanding_since  TIMESTAMPTZ,
  manifest_id        TEXT,                   -- FK to manifests.id, nullable
  manifest_kind      TEXT CHECK (manifest_kind IN ('dispatch','return') OR manifest_kind IS NULL),
  hub_arrival_at     TIMESTAMPTZ,            -- drives the 7-day WSW/hub aging check
  transfer_to_code   TEXT REFERENCES sites(code), -- set during Inter-DC Transfer
  registered_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_manifest ON assets(manifest_id);
-- The scanner's non-linear panels list "what is at my site" on entry;
-- these are the columns those filters key off.
CREATE INDEX IF NOT EXISTS idx_assets_home_site ON assets(home_site_code);
CREATE INDEX IF NOT EXISTS idx_assets_transfer_to ON assets(transfer_to_code);

-- ---------------------------------------------------------------------
-- Manifests: created automatically from what gets scanned at TP1 (kind
-- 'dispatch') or TP6 (kind 'return'). `stage` tracks progress: for a
-- dispatch manifest, 1=open(TP1) 2=closed(TP2) 3=tdtIntake(TP3)
-- 4=tdtLoaded(TP4) 5=hubIntake(TP5, dispatch considered complete).
-- For a return manifest: 6=staged(TP6) 7=received(TP7).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manifests (
  id                   TEXT PRIMARY KEY,     -- e.g. 'MAN-482913' or 'RET-731004'
  kind                 TEXT NOT NULL CHECK (kind IN ('dispatch','return')),
  origin_dc_code       TEXT REFERENCES sites(code),
  destination_hub_code TEXT REFERENCES sites(code),
  origin_hub_code      TEXT REFERENCES sites(code),
  destination_dc_code  TEXT REFERENCES sites(code),
  stage                INTEGER NOT NULL,
  epod_id              TEXT,                 -- set when TP4 confirms load
  eta                  TIMESTAMPTZ,
  completed_dispatch   INTEGER NOT NULL DEFAULT 0, -- 0/1, not BOOLEAN: the
                                                   -- API's JSON shape is
                                                   -- consumed as-is by both
                                                   -- frontends
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Every scanner panel opens with "which manifests are at my stage?".
CREATE INDEX IF NOT EXISTS idx_manifests_kind_stage ON manifests(kind, stage);

-- ---------------------------------------------------------------------
-- Manifest <-> Asset join: which assets are expected on a manifest, and
-- whether/when each one has actually been scanned at the CURRENT touch
-- point being worked. Persisting it server-side means an in-progress
-- scan session survives a page reload or a device swap.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manifest_assets (
  manifest_id   TEXT NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
  asset_id      TEXT NOT NULL REFERENCES assets(id),
  expected      INTEGER NOT NULL DEFAULT 1,   -- 0/1
  scanned       INTEGER NOT NULL DEFAULT 0,   -- 0/1
  scanned_at    TIMESTAMPTZ,
  PRIMARY KEY (manifest_id, asset_id)
);

-- ---------------------------------------------------------------------
-- Custody log: append-only history of every scan event on an asset,
-- across every touch point and non-linear flow. This is the "Scan
-- history" timeline shown in the console's asset detail modal.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custody_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id     TEXT NOT NULL REFERENCES assets(id),
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  note         TEXT NOT NULL,
  operator     TEXT
);
CREATE INDEX IF NOT EXISTS idx_custody_asset ON custody_log(asset_id);

-- ---------------------------------------------------------------------
-- Exceptions: Missed Scan, Unexpected Asset, Missing Asset, Aged at
-- Hub, Overdue Return, Damaged. Feeds the console dashboard's exception
-- feed and the "Exception count" KPI.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exceptions (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  type         TEXT NOT NULL,
  asset_id     TEXT NOT NULL REFERENCES assets(id),
  note         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exceptions_ts ON exceptions(ts DESC);

-- ---------------------------------------------------------------------
-- Operators: NOT real authentication yet — see the technical spec's
-- "Known gaps". This just gives you a table to build real auth against
-- (password hash, SSO subject, etc.) instead of the free-text name
-- field the prototype currently uses.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operators (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('DC','TDT','Hub','WSW','Viewer')),
  site_code    TEXT REFERENCES sites(code),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Fleet-wide tagging coverage counters (the console's "77% -> 100%" KPI).
-- Single row, updated as assets are registered.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet_counters (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  tagged_fleet  INTEGER NOT NULL DEFAULT 0,
  total_fleet   INTEGER NOT NULL DEFAULT 0
);
INSERT INTO fleet_counters (id, tagged_fleet, total_fleet)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;
