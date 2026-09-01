-- =====================================================================
-- TFS LOGISTICS — Mercury backend schema (SQLite dialect)
-- Mirrors the data model currently held in browser localStorage by
-- mercury-scanner.html and mercury-console.html. Portable to Postgres/
-- MySQL with minor type changes (see README "Swapping the database").
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Sites: DCs, Hubs, Returns Facilities, GLS vendor sites.
-- Replaces the DC_SITES / HUB_SITES / RETURNS_SITES / GLS_SITES arrays
-- in the frontend. `code` is what operators see and select at login.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sites (
  code        TEXT PRIMARY KEY,             -- e.g. 'JHB-DC1', 'Alberton (ALB)'
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('DC','Hub','Returns','GLS')),
  lat         REAL,                         -- nullable: not every site is geocoded yet
  lng         REAL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- Assets: one row per Rolltainer / Hyper Cage.
-- `status` is the human-readable state shown in the UI (e.g. "Available
-- at DC", "At Hub: Alberton (ALB)", "In Maintenance"). `stage` is the
-- numeric position in the 7-touch-point loop (0 = idle/available).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assets (
  id                TEXT PRIMARY KEY,        -- barcode, e.g. 'RT-100001'
  type              TEXT NOT NULL CHECK (type IN ('Rolltainer','Hyper Cage')),
  home_site_code    TEXT NOT NULL REFERENCES sites(code),
  status            TEXT NOT NULL DEFAULT 'Available at DC',
  stage             INTEGER NOT NULL DEFAULT 0,
  outstanding_reason TEXT,                   -- NULL = not outstanding
  outstanding_since  TEXT,
  manifest_id       TEXT,                    -- FK to manifests.id, nullable
  manifest_kind     TEXT CHECK (manifest_kind IN ('dispatch','return') OR manifest_kind IS NULL),
  hub_arrival_at    TEXT,                    -- drives the 7-day WSW/hub aging check
  transfer_to_code  TEXT REFERENCES sites(code), -- set during Inter-DC Transfer
  registered_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_manifest ON assets(manifest_id);

-- ---------------------------------------------------------------------
-- Manifests: created automatically from what gets scanned at TP1 (kind
-- 'dispatch') or TP6 (kind 'return'). `stage` tracks progress: for a
-- dispatch manifest, 1=open(TP1) 2=closed(TP2) 3=tdtIntake(TP3)
-- 4=tdtLoaded(TP4) 5=hubIntake(TP5, dispatch considered complete).
-- For a return manifest: 6=staged(TP6) 7=received(TP7).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manifests (
  id                  TEXT PRIMARY KEY,      -- e.g. 'MAN-482913' or 'RET-731004'
  kind                TEXT NOT NULL CHECK (kind IN ('dispatch','return')),
  origin_dc_code      TEXT REFERENCES sites(code),
  destination_hub_code TEXT REFERENCES sites(code),
  origin_hub_code     TEXT REFERENCES sites(code),
  destination_dc_code TEXT REFERENCES sites(code),
  stage               INTEGER NOT NULL,
  epod_id             TEXT,                  -- set when TP4 confirms load
  eta                 TEXT,
  completed_dispatch  INTEGER NOT NULL DEFAULT 0, -- boolean 0/1
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- Manifest <-> Asset join: which assets are expected on a manifest, and
-- whether/when each one has actually been scanned at the CURRENT touch
-- point being worked. This is what the frontend calls buf.expected /
-- buf.scanned during a scan session — persisting it server-side means
-- an in-progress scan session survives a page reload or device swap.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manifest_assets (
  manifest_id   TEXT NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
  asset_id      TEXT NOT NULL REFERENCES assets(id),
  expected      INTEGER NOT NULL DEFAULT 1,   -- boolean 0/1
  scanned       INTEGER NOT NULL DEFAULT 0,   -- boolean 0/1
  scanned_at    TEXT,
  PRIMARY KEY (manifest_id, asset_id)
);

-- ---------------------------------------------------------------------
-- Custody log: append-only history of every scan event on an asset,
-- across every touch point and non-linear flow. This is the "Scan
-- history" timeline shown in Mercury Console's asset detail modal.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custody_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id     TEXT NOT NULL REFERENCES assets(id),
  ts           TEXT NOT NULL DEFAULT (datetime('now')),
  note         TEXT NOT NULL,
  operator     TEXT
);
CREATE INDEX IF NOT EXISTS idx_custody_asset ON custody_log(asset_id);

-- ---------------------------------------------------------------------
-- Exceptions: Missed Scan, Unexpected Asset, Missing Asset, Aged at
-- Hub, Overdue Return, Damaged. Feeds the Console dashboard's
-- exception feed and the "Exception count" KPI.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exceptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL DEFAULT (datetime('now')),
  type         TEXT NOT NULL,
  asset_id     TEXT NOT NULL REFERENCES assets(id),
  note         TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- Operators: NOT real authentication yet — see technical spec section
-- "Known gaps". This just gives you a table to build real auth against
-- (password hash, SSO subject, etc.) instead of the free-text name
-- field the prototype currently uses.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operators (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('DC','TDT','Hub','WSW','Viewer')),
  site_code    TEXT REFERENCES sites(code),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- Fleet-wide tagging coverage counters (Console's "77% -> 100%" KPI).
-- Single row, updated as assets are registered.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet_counters (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  tagged_fleet  INTEGER NOT NULL DEFAULT 0,
  total_fleet   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO fleet_counters (id, tagged_fleet, total_fleet) VALUES (1, 0, 0);
