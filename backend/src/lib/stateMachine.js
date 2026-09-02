// src/lib/stateMachine.js
//
// Full server-side implementation of the business logic documented in
// TECHNICAL-SPEC.md §4-6: all 7 touch points, both WSW steps, and all 5
// non-linear flows. Every function follows the same pattern — validate
// → transition → log custody → log exceptions on mismatch → return
// updated state.
//
// Every helper takes an executor (`x`) as its first argument: either
// the module-level `db`, or the `tx` handed in by db.transaction(). A
// Postgres pool hands out a different connection per query, so a
// statement inside a transaction that went through `db` instead of `tx`
// would commit on its own and survive a rollback. Passing the executor
// explicitly is what makes that mistake impossible to write by accident
// rather than merely discouraged.

const db = require('../db');
const cache = require('./cache');

function nowIso() { return new Date().toISOString(); }
function genId(prefix) { return prefix + '-' + String(Math.floor(100000 + Math.random() * 899999)); }

function logCustody(x, assetId, note, operator) {
  return x.run(`INSERT INTO custody_log (asset_id, ts, note, operator) VALUES (?, ?, ?, ?)`, [assetId, nowIso(), note, operator || null]);
}
function logException(x, type, assetId, note) {
  return x.run(`INSERT INTO exceptions (ts, type, asset_id, note) VALUES (?, ?, ?, ?)`, [nowIso(), type, assetId, note]);
}
function getAsset(id, x = db) { return x.get(`SELECT * FROM assets WHERE id = ?`, [id]); }
function getManifest(id, x = db) { return x.get(`SELECT * FROM manifests WHERE id = ?`, [id]); }
async function expectedAssetIds(manifestId, x = db) {
  const rows = await x.all(`SELECT asset_id FROM manifest_assets WHERE manifest_id = ? AND expected = 1`, [manifestId]);
  return rows.map((r) => r.asset_id);
}
class BusinessError extends Error {
  constructor(message) { super(message); this.name = 'BusinessError'; this.statusCode = 400; }
}

async function invalidateDashboardCache() {
  await cache.delPrefix('dashboard:');
}

/** Whole days since a TIMESTAMPTZ column. `pg` and PGlite both hand
 *  those back as Date objects; a string would still parse. */
function ageDays(ts) {
  if (!ts) return null;
  const t = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
}

// ===================== TP1 — DC Dispatch Open =====================
function tp1DispatchOpen(siteCode, operator, assetIds) {
  if (!assetIds || assetIds.length === 0) throw new BusinessError('at least one asset must be scanned');
  const manifestId = genId('MAN');
  return db.transaction(async (tx) => {
    await tx.run(`INSERT INTO manifests (id, kind, origin_dc_code, stage, completed_dispatch, created_at) VALUES (?, 'dispatch', ?, 1, 0, ?)`, [manifestId, siteCode, nowIso()]);
    for (const assetId of assetIds) {
      const asset = await getAsset(assetId, tx);
      if (!asset) throw new BusinessError(`Unknown asset: ${assetId}`);
      if (asset.home_site_code !== siteCode || asset.status !== 'Available at DC') {
        throw new BusinessError(`${assetId} is not available at ${siteCode}`);
      }
      await tx.run(`INSERT INTO manifest_assets (manifest_id, asset_id, expected, scanned, scanned_at) VALUES (?, ?, 1, 1, ?)`, [manifestId, assetId, nowIso()]);
      await tx.run(`UPDATE assets SET status='In Dispatch', stage=1, manifest_id=?, manifest_kind='dispatch', outstanding_reason=NULL, outstanding_since=NULL WHERE id=?`, [manifestId, assetId]);
      await logCustody(tx, assetId, 'TP1 Dispatch Open', operator);
    }
    return { manifestId };
  });
}

// ===================== TP2 — DC Dispatch Close =====================
async function tp2DispatchClose(manifestId, destinationHubCode, scannedAssetIds, operator) {
  const manifest = await getManifest(manifestId);
  if (!manifest || manifest.kind !== 'dispatch' || manifest.stage !== 1) throw new BusinessError('manifest is not open for TP2');
  const expected = await expectedAssetIds(manifestId);
  const scannedSet = new Set(scannedAssetIds);
  const missing = expected.filter((id) => !scannedSet.has(id));

  return db.transaction(async (tx) => {
    await tx.run(`UPDATE manifests SET destination_hub_code=?, stage=2 WHERE id=?`, [destinationHubCode, manifestId]);
    for (const assetId of expected) {
      if (missing.includes(assetId)) {
        await tx.run(`UPDATE assets SET outstanding_reason=?, outstanding_since=? WHERE id=?`, ['Missing at Dispatch Close', nowIso(), assetId]);
        await logException(tx, 'Missed Scan', assetId, `Not scanned at TP2 on manifest ${manifestId}.`);
      } else {
        await tx.run(`UPDATE assets SET status='Dispatched — In Transit', stage=2, outstanding_reason=NULL, outstanding_since=NULL WHERE id=?`, [assetId]);
        await tx.run(`UPDATE manifest_assets SET scanned=1, scanned_at=? WHERE manifest_id=? AND asset_id=?`, [nowIso(), manifestId, assetId]);
        await logCustody(tx, assetId, 'TP2 Dispatch Close', operator);
      }
    }
    for (const assetId of scannedAssetIds) {
      if (!expected.includes(assetId)) await logException(tx, 'Unexpected Asset', assetId, `Scanned at TP2 but not on manifest ${manifestId}.`);
    }
    return { missing };
  });
}

// ===================== TP3 — TDT Dispatch Intake =====================
async function tp3TdtIntake(manifestId, scannedAssetIds, operator) {
  const manifest = await getManifest(manifestId);
  if (!manifest || manifest.kind !== 'dispatch' || manifest.stage !== 2) throw new BusinessError('manifest is not ready for TP3');
  const expected = await expectedAssetIds(manifestId);
  const scannedSet = new Set();
  const unexpected = [];
  for (const assetId of scannedAssetIds) {
    if (!expected.includes(assetId)) { unexpected.push(assetId); continue; }
    scannedSet.add(assetId);
  }
  const pending = expected.filter((id) => !scannedSet.has(id));

  return db.transaction(async (tx) => {
    for (const assetId of unexpected) {
      await logException(tx, 'Unexpected Asset', assetId, `Scanned at TP3 but not on manifest ${manifestId}.`);
    }
    await tx.run(`UPDATE manifests SET stage=3 WHERE id=?`, [manifestId]);
    for (const assetId of expected) {
      if (pending.includes(assetId)) {
        await tx.run(`UPDATE assets SET outstanding_reason=?, outstanding_since=? WHERE id=?`, ['Pending at TDT Intake', nowIso(), assetId]);
        await logException(tx, 'Missed Scan', assetId, `Not scanned at TP3 for manifest ${manifestId}.`);
      } else {
        await tx.run(`UPDATE assets SET status='Loaded on TDT — In Transit', stage=3, outstanding_reason=NULL, outstanding_since=NULL WHERE id=?`, [assetId]);
        await tx.run(`UPDATE manifest_assets SET scanned=1, scanned_at=? WHERE manifest_id=? AND asset_id=?`, [nowIso(), manifestId, assetId]);
        await logCustody(tx, assetId, 'TP3 TDT Intake', operator);
      }
    }
    return { pending };
  });
}

// ===================== TP4 — TDT Dispatch Loaded =====================
async function tp4TdtLoaded(manifestId, notLoadedReasons, operator) {
  const manifest = await getManifest(manifestId);
  if (!manifest || manifest.kind !== 'dispatch' || manifest.stage !== 3) throw new BusinessError('manifest is not ready for TP4');
  const expected = await expectedAssetIds(manifestId);
  const stillMissing = [];
  for (const id of expected) {
    const a = await getAsset(id);
    if (a.outstanding_reason && !notLoadedReasons[id]) stillMissing.push(id);
  }
  if (stillMissing.length) throw new BusinessError(`assign a reason code to every missing asset: ${stillMissing.join(', ')}`);

  const ePodId = 'ePOD-' + manifestId;
  const eta = new Date(Date.now() + (3 + Math.floor(Math.random() * 4)) * 3600000).toISOString();

  return db.transaction(async (tx) => {
    await tx.run(`UPDATE manifests SET stage=4, epod_id=?, eta=? WHERE id=?`, [ePodId, eta, manifestId]);
    for (const assetId of expected) {
      if (notLoadedReasons[assetId]) {
        await tx.run(`UPDATE assets SET outstanding_reason=?, outstanding_since=? WHERE id=?`, ['Not loaded — ' + notLoadedReasons[assetId], nowIso(), assetId]);
        await logException(tx, 'Missing Asset', assetId, `Marked not loaded at TP4 (${notLoadedReasons[assetId]}).`);
      } else {
        await tx.run(`UPDATE assets SET status='In Transit to Hub', stage=4, outstanding_reason=NULL, outstanding_since=NULL WHERE id=?`, [assetId]);
        await logCustody(tx, assetId, 'TP4 Dispatch Loaded — ePOD generated', operator);
      }
    }
    return { ePodId, eta };
  });
}

// ===================== TP5 — Hub Intake =====================
async function tp5HubIntake(manifestId, siteCode, scannedAssetIds, operator) {
  const manifest = await getManifest(manifestId);
  if (!manifest || manifest.kind !== 'dispatch' || manifest.stage !== 4) throw new BusinessError('manifest is not ready for TP5');
  const expected = await expectedAssetIds(manifestId);
  const scannedSet = new Set();
  const unexpected = [];
  for (const assetId of scannedAssetIds) {
    if (!expected.includes(assetId)) { unexpected.push(assetId); continue; }
    scannedSet.add(assetId);
  }

  return db.transaction(async (tx) => {
    for (const assetId of unexpected) {
      await logException(tx, 'Unexpected Asset', assetId, `Unexpected arrival at Hub Intake, manifest ${manifestId}.`);
    }
    await tx.run(`UPDATE manifests SET stage=5, completed_dispatch=1 WHERE id=?`, [manifestId]);
    for (const assetId of expected) {
      if (scannedSet.has(assetId)) {
        await tx.run(`UPDATE assets SET status=?, stage=5, hub_arrival_at=?, outstanding_reason=NULL, outstanding_since=NULL WHERE id=?`, [`At Hub: ${siteCode}`, nowIso(), assetId]);
        await logCustody(tx, assetId, `TP5 Hub Intake at ${siteCode}`, operator);
      } else {
        await tx.run(`UPDATE assets SET outstanding_reason=?, outstanding_since=? WHERE id=?`, ['Not received at Hub Intake', nowIso(), assetId]);
        await logException(tx, 'Missing Asset', assetId, `Not received at Hub Intake for manifest ${manifestId}.`);
      }
    }
    return { received: [...scannedSet] };
  });
}

// ===================== TP6 — Hub Empty Collection =====================
async function tp6HubEmptyCollection(siteCode, stagedAssetIds, operator) {
  if (!stagedAssetIds || stagedAssetIds.length === 0) throw new BusinessError('at least one asset must be staged');
  const returnManifestId = genId('RET');
  const atHub = await db.all(`SELECT * FROM assets WHERE status = ?`, [`At Hub: ${siteCode}`]);
  const atHubIds = new Set(atHub.map((a) => a.id));

  return db.transaction(async (tx) => {
    await tx.run(`INSERT INTO manifests (id, kind, origin_hub_code, stage, created_at) VALUES (?, 'return', ?, 6, ?)`, [returnManifestId, siteCode, nowIso()]);
    for (const assetId of stagedAssetIds) {
      if (!atHubIds.has(assetId)) throw new BusinessError(`${assetId} is not currently at ${siteCode}`);
      await tx.run(`INSERT INTO manifest_assets (manifest_id, asset_id, expected, scanned, scanned_at) VALUES (?, ?, 1, 1, ?)`, [returnManifestId, assetId, nowIso()]);
      await tx.run(`UPDATE assets SET status='Ready for Return — Awaiting Collection', stage=6, manifest_id=?, manifest_kind='return' WHERE id=?`, [returnManifestId, assetId]);
      await logCustody(tx, assetId, `TP6 Empty Collection staged at ${siteCode}`, operator);
    }
    const stagedSet = new Set(stagedAssetIds);
    for (const asset of atHub) {
      if (!stagedSet.has(asset.id) && asset.hub_arrival_at) {
        const days = ageDays(asset.hub_arrival_at);
        if (days !== null && days >= 7) {
          await logException(tx, 'Aged at Hub', asset.id, `${asset.id} at hub ${siteCode} for ${days} days — priority collection alert.`);
        }
      }
    }
    return { returnManifestId };
  });
}

// ===================== TP7 — DC Return Receipt (+ Returns Facility Routing) =====================
async function tp7ReturnReceipt(manifestId, destinationCode, scannedAssetIds, operator, isReturnsFacility) {
  const manifest = await getManifest(manifestId);
  if (!manifest || manifest.kind !== 'return' || manifest.stage !== 6) throw new BusinessError('manifest is not ready for TP7');
  const expected = await expectedAssetIds(manifestId);
  const scannedSet = new Set(scannedAssetIds);

  return db.transaction(async (tx) => {
    await tx.run(`UPDATE manifests SET destination_dc_code=?, stage=7 WHERE id=?`, [destinationCode, manifestId]);
    for (const assetId of expected) {
      if (scannedSet.has(assetId)) {
        const status = isReturnsFacility ? 'Available at Returns Facility' : 'Available at DC';
        await tx.run(`UPDATE assets SET status=?, stage=0, home_site_code=?, manifest_id=NULL, manifest_kind=NULL, hub_arrival_at=NULL, outstanding_reason=NULL, outstanding_since=NULL WHERE id=?`, [status, destinationCode, assetId]);
        await logCustody(tx, assetId, isReturnsFacility ? `TP7 Routed to returns facility (${destinationCode})` : 'TP7 Return Receipt — chain-of-custody archived', operator);
      } else {
        await tx.run(`UPDATE assets SET outstanding_reason=?, outstanding_since=? WHERE id=?`, ['Outstanding return', nowIso(), assetId]);
        await logException(tx, 'Overdue Return', assetId, `Dispatched but not returned on manifest ${manifestId}.`);
      }
    }
    return {};
  });
}

// ===================== WSW1 — WSW Intake =====================
async function wsw1Intake(siteCode, assetId, operator) {
  const asset = await getAsset(assetId);
  if (!asset) throw new BusinessError(`Unknown asset: ${assetId}`);
  if (asset.status === `At WSW: ${siteCode}`) throw new BusinessError('already at WSW here');
  return db.transaction(async (tx) => {
    await tx.run(`UPDATE assets SET status=?, outstanding_reason=NULL, outstanding_since=NULL, manifest_id=NULL, manifest_kind=NULL, transfer_to_code=NULL WHERE id=?`, [`At WSW: ${siteCode}`, assetId]);
    await logCustody(tx, assetId, `WSW Intake — received misrouted stock at ${siteCode}`, operator);
    return {};
  });
}

// ===================== WSW2 — WSW Sort & Process =====================
async function wsw2SortProcess(siteCode, assetId, operator) {
  const asset = await getAsset(assetId);
  if (!asset || asset.status !== `At WSW: ${siteCode}`) throw new BusinessError('not currently at WSW here');
  return db.transaction(async (tx) => {
    await tx.run(`UPDATE assets SET status='Available at DC', home_site_code=? WHERE id=?`, [siteCode, assetId]);
    await logCustody(tx, assetId, 'WSW Sort & Process — released to active DC stock for hub dispatch', operator);
    return {};
  });
}

// ===================== Damaged Asset Scan-Out =====================
async function damagedScanOut(assetId, note, operator) {
  const asset = await getAsset(assetId);
  if (!asset) throw new BusinessError(`Unknown asset: ${assetId}`);
  if (asset.status === 'Damaged / Written Off') throw new BusinessError('already marked damaged');
  return db.transaction(async (tx) => {
    await tx.run(`UPDATE assets SET status='Damaged / Written Off', stage=0, outstanding_reason=NULL, outstanding_since=NULL, manifest_id=NULL, manifest_kind=NULL, transfer_to_code=NULL WHERE id=?`, [assetId]);
    await logCustody(tx, assetId, 'Damaged Asset Scan-Out — ' + note, operator);
    await logException(tx, 'Damaged', assetId, `Scanned out as damaged by ${operator}: ${note}`);
    return {};
  });
}

// ===================== Maintenance =====================
async function maintenanceOut(siteCode, assetId, reason, operator) {
  const asset = await getAsset(assetId);
  if (!asset || asset.home_site_code !== siteCode || asset.status !== 'Available at DC') throw new BusinessError('not available at this DC');
  return db.transaction(async (tx) => {
    await tx.run(`UPDATE assets SET status='In Maintenance', outstanding_reason=NULL WHERE id=?`, [assetId]);
    await logCustody(tx, assetId, 'Maintenance Scan-Out — ' + reason, operator);
    return {};
  });
}
async function maintenanceIn(siteCode, assetId, operator) {
  const asset = await getAsset(assetId);
  if (!asset || asset.status !== 'In Maintenance') throw new BusinessError('not currently in maintenance');
  return db.transaction(async (tx) => {
    await tx.run(`UPDATE assets SET status='Available at DC', home_site_code=? WHERE id=?`, [siteCode, assetId]);
    await logCustody(tx, assetId, 'Maintenance Scan-In — repaired, returned to active fleet', operator);
    return {};
  });
}

// ===================== GLS Vendor Custody =====================
async function glsCustodyOut(siteCode, assetId, glsSite, operator) {
  const asset = await getAsset(assetId);
  if (!asset || asset.home_site_code !== siteCode || asset.status !== 'Available at DC') throw new BusinessError('not available at this DC');
  return db.transaction(async (tx) => {
    await tx.run(`UPDATE assets SET status=?, outstanding_reason=NULL WHERE id=?`, [`With GLS Vendor: ${glsSite}`, assetId]);
    await logCustody(tx, assetId, 'GLS Vendor Custody — transferred to ' + glsSite, operator);
    return {};
  });
}
async function glsCustodyIn(siteCode, assetId, operator) {
  const asset = await getAsset(assetId);
  if (!asset || !asset.status.startsWith('With GLS Vendor')) throw new BusinessError('not currently with GLS');
  return db.transaction(async (tx) => {
    await tx.run(`UPDATE assets SET status='Available at DC', home_site_code=? WHERE id=?`, [siteCode, assetId]);
    await logCustody(tx, assetId, 'GLS Vendor Custody — returned to ' + siteCode, operator);
    return {};
  });
}

// ===================== Inter-DC Transfer =====================
async function interDcOut(siteCode, assetId, toSiteCode, operator) {
  const asset = await getAsset(assetId);
  if (!asset || asset.home_site_code !== siteCode || asset.status !== 'Available at DC') throw new BusinessError('not available at this DC');
  return db.transaction(async (tx) => {
    await tx.run(`UPDATE assets SET status=?, transfer_to_code=?, outstanding_reason=NULL WHERE id=?`, [`Inter-DC Transfer to ${toSiteCode}`, toSiteCode, assetId]);
    await logCustody(tx, assetId, 'Inter-DC Transfer — scanned out to ' + toSiteCode, operator);
    return {};
  });
}
async function interDcIn(siteCode, assetId, operator) {
  const asset = await getAsset(assetId);
  if (!asset || asset.transfer_to_code !== siteCode || !asset.status.startsWith('Inter-DC Transfer')) throw new BusinessError('not an inbound transfer here');
  return db.transaction(async (tx) => {
    await tx.run(`UPDATE assets SET status='Available at DC', home_site_code=?, transfer_to_code=NULL WHERE id=?`, [siteCode, assetId]);
    await logCustody(tx, assetId, 'Inter-DC Transfer — received at ' + siteCode, operator);
    return {};
  });
}

module.exports = {
  BusinessError, nowIso, genId, ageDays, logCustody, logException, getAsset, getManifest, expectedAssetIds, invalidateDashboardCache,
  tp1DispatchOpen, tp2DispatchClose, tp3TdtIntake, tp4TdtLoaded, tp5HubIntake, tp6HubEmptyCollection, tp7ReturnReceipt,
  wsw1Intake, wsw2SortProcess,
  damagedScanOut, maintenanceOut, maintenanceIn, glsCustodyOut, glsCustodyIn, interDcOut, interDcIn,
};
