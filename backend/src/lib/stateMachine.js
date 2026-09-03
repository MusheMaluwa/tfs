// src/lib/stateMachine.js
//
// Full server-side implementation of the business logic documented in
// TECHNICAL-SPEC.md §4-6: all 7 touch points, both WSW steps, and all 5
// non-linear flows. Every function follows the same pattern — validate
// → transition → log custody → log exceptions on mismatch → return
// updated state.
//
// Every helper takes an executor (`x`) as its first argument: either
// the module-level `db`, or the `tx` handed in by db.transaction(). The
// module-level accessors are bound to no session, so a write inside a
// transaction that went through `db` instead of `tx` would commit on
// its own and survive a rollback. Passing the executor explicitly is
// what makes that mistake impossible to write by accident rather than
// merely discouraged.
//
// Timestamps are written as Date objects, not ISO strings: MongoDB
// stores them as BSON dates, which sort correctly and come back as
// Dates, and JSON.stringify turns those into the same ISO-8601 Z
// strings the API returned before.

const db = require('../db');
const cache = require('./cache');

function nowIso() { return new Date().toISOString(); }
function now() { return new Date(); }
function genId(prefix) { return prefix + '-' + String(Math.floor(100000 + Math.random() * 899999)); }

function logCustody(x, assetId, note, operator) {
  const id = db.newId();
  return x.custodyLog.insertOne({ _id: id, id, asset_id: assetId, ts: now(), note, operator: operator || null });
}
function logException(x, type, assetId, note) {
  const id = db.newId();
  return x.exceptions.insertOne({ _id: id, id, ts: now(), type, asset_id: assetId, note });
}
function getAsset(id, x = db) { return x.assets.findOne({ _id: id }); }
function getManifest(id, x = db) { return x.manifests.findOne({ _id: id }); }
async function expectedAssetIds(manifestId, x = db) {
  const rows = await x.manifestAssets.find(
    { manifest_id: manifestId, expected: 1 },
    { projection: { _id: 0, asset_id: 1 } }
  );
  return rows.map((r) => r.asset_id);
}
class BusinessError extends Error {
  constructor(message) { super(message); this.name = 'BusinessError'; this.statusCode = 400; }
}

async function invalidateDashboardCache() {
  await cache.delPrefix('dashboard:');
}

/** Whole days since a stored timestamp. The driver hands BSON dates
 *  back as Date objects; a string would still parse. */
function ageDays(ts) {
  if (!ts) return null;
  const t = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
}

/** The fields TP1/TP6 set on a manifest_assets row. Written through an
 *  upsert on the composite `_id`, so re-running a touch point that was
 *  interrupted mid-write cannot leave a duplicate join row behind. */
function joinRow(manifestId, assetId) {
  return {
    _id: `${manifestId}::${assetId}`,
    manifest_id: manifestId,
    asset_id: assetId,
    expected: 1,
    scanned: 1,
    scanned_at: now(),
  };
}

// ===================== TP1 — DC Dispatch Open =====================
function tp1DispatchOpen(siteCode, operator, assetIds) {
  if (!assetIds || assetIds.length === 0) throw new BusinessError('at least one asset must be scanned');
  const manifestId = genId('MAN');
  return db.transaction(async (tx) => {
    await tx.manifests.updateOne(
      { _id: manifestId },
      {
        $set: {
          id: manifestId,
          kind: 'dispatch',
          origin_dc_code: siteCode,
          stage: 1,
          completed_dispatch: 0,
          created_at: now(),
        },
      },
      { upsert: true }
    );
    for (const assetId of assetIds) {
      const asset = await getAsset(assetId, tx);
      if (!asset) throw new BusinessError(`Unknown asset: ${assetId}`);
      if (asset.home_site_code !== siteCode || asset.status !== 'Available at DC') {
        throw new BusinessError(`${assetId} is not available at ${siteCode}`);
      }
      const row = joinRow(manifestId, assetId);
      await tx.manifestAssets.updateOne({ _id: row._id }, { $set: row }, { upsert: true });
      await tx.assets.updateOne({ _id: assetId }, {
        $set: {
          status: 'In Dispatch',
          stage: 1,
          manifest_id: manifestId,
          manifest_kind: 'dispatch',
          outstanding_reason: null,
          outstanding_since: null,
        },
      });
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
    await tx.manifests.updateOne({ _id: manifestId }, { $set: { destination_hub_code: destinationHubCode, stage: 2 } });
    for (const assetId of expected) {
      if (missing.includes(assetId)) {
        await tx.assets.updateOne({ _id: assetId }, { $set: { outstanding_reason: 'Missing at Dispatch Close', outstanding_since: now() } });
        await logException(tx, 'Missed Scan', assetId, `Not scanned at TP2 on manifest ${manifestId}.`);
      } else {
        await tx.assets.updateOne({ _id: assetId }, {
          $set: { status: 'Dispatched — In Transit', stage: 2, outstanding_reason: null, outstanding_since: null },
        });
        await tx.manifestAssets.updateOne(
          { manifest_id: manifestId, asset_id: assetId },
          { $set: { scanned: 1, scanned_at: now() } }
        );
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
    await tx.manifests.updateOne({ _id: manifestId }, { $set: { stage: 3 } });
    for (const assetId of expected) {
      if (pending.includes(assetId)) {
        await tx.assets.updateOne({ _id: assetId }, { $set: { outstanding_reason: 'Pending at TDT Intake', outstanding_since: now() } });
        await logException(tx, 'Missed Scan', assetId, `Not scanned at TP3 for manifest ${manifestId}.`);
      } else {
        await tx.assets.updateOne({ _id: assetId }, {
          $set: { status: 'Loaded on TDT — In Transit', stage: 3, outstanding_reason: null, outstanding_since: null },
        });
        await tx.manifestAssets.updateOne(
          { manifest_id: manifestId, asset_id: assetId },
          { $set: { scanned: 1, scanned_at: now() } }
        );
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
  const eta = new Date(Date.now() + (3 + Math.floor(Math.random() * 4)) * 3600000);

  return db.transaction(async (tx) => {
    await tx.manifests.updateOne({ _id: manifestId }, { $set: { stage: 4, epod_id: ePodId, eta } });
    for (const assetId of expected) {
      if (notLoadedReasons[assetId]) {
        await tx.assets.updateOne({ _id: assetId }, {
          $set: { outstanding_reason: 'Not loaded — ' + notLoadedReasons[assetId], outstanding_since: now() },
        });
        await logException(tx, 'Missing Asset', assetId, `Marked not loaded at TP4 (${notLoadedReasons[assetId]}).`);
      } else {
        await tx.assets.updateOne({ _id: assetId }, {
          $set: { status: 'In Transit to Hub', stage: 4, outstanding_reason: null, outstanding_since: null },
        });
        await logCustody(tx, assetId, 'TP4 Dispatch Loaded — ePOD generated', operator);
      }
    }
    // The ETA goes out as the ISO string the API has always returned;
    // it is a Date in the database.
    return { ePodId, eta: eta.toISOString() };
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
    await tx.manifests.updateOne({ _id: manifestId }, { $set: { stage: 5, completed_dispatch: 1 } });
    for (const assetId of expected) {
      if (scannedSet.has(assetId)) {
        await tx.assets.updateOne({ _id: assetId }, {
          $set: {
            status: `At Hub: ${siteCode}`,
            stage: 5,
            hub_arrival_at: now(),
            outstanding_reason: null,
            outstanding_since: null,
          },
        });
        await logCustody(tx, assetId, `TP5 Hub Intake at ${siteCode}`, operator);
      } else {
        await tx.assets.updateOne({ _id: assetId }, { $set: { outstanding_reason: 'Not received at Hub Intake', outstanding_since: now() } });
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
  const atHub = await db.assets.find({ status: `At Hub: ${siteCode}` });
  const atHubIds = new Set(atHub.map((a) => a.id));

  return db.transaction(async (tx) => {
    await tx.manifests.updateOne(
      { _id: returnManifestId },
      {
        $set: {
          id: returnManifestId,
          kind: 'return',
          origin_hub_code: siteCode,
          stage: 6,
          completed_dispatch: 0,
          created_at: now(),
        },
      },
      { upsert: true }
    );
    for (const assetId of stagedAssetIds) {
      if (!atHubIds.has(assetId)) throw new BusinessError(`${assetId} is not currently at ${siteCode}`);
      const row = joinRow(returnManifestId, assetId);
      await tx.manifestAssets.updateOne({ _id: row._id }, { $set: row }, { upsert: true });
      await tx.assets.updateOne({ _id: assetId }, {
        $set: {
          status: 'Ready for Return — Awaiting Collection',
          stage: 6,
          manifest_id: returnManifestId,
          manifest_kind: 'return',
        },
      });
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
    await tx.manifests.updateOne({ _id: manifestId }, { $set: { destination_dc_code: destinationCode, stage: 7 } });
    for (const assetId of expected) {
      if (scannedSet.has(assetId)) {
        const status = isReturnsFacility ? 'Available at Returns Facility' : 'Available at DC';
        await tx.assets.updateOne({ _id: assetId }, {
          $set: {
            status,
            stage: 0,
            home_site_code: destinationCode,
            manifest_id: null,
            manifest_kind: null,
            hub_arrival_at: null,
            outstanding_reason: null,
            outstanding_since: null,
          },
        });
        await logCustody(tx, assetId, isReturnsFacility ? `TP7 Routed to returns facility (${destinationCode})` : 'TP7 Return Receipt — chain-of-custody archived', operator);
      } else {
        await tx.assets.updateOne({ _id: assetId }, { $set: { outstanding_reason: 'Outstanding return', outstanding_since: now() } });
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
    await tx.assets.updateOne({ _id: assetId }, {
      $set: {
        status: `At WSW: ${siteCode}`,
        outstanding_reason: null,
        outstanding_since: null,
        manifest_id: null,
        manifest_kind: null,
        transfer_to_code: null,
      },
    });
    await logCustody(tx, assetId, `WSW Intake — received misrouted stock at ${siteCode}`, operator);
    return {};
  });
}

// ===================== WSW2 — WSW Sort & Process =====================
async function wsw2SortProcess(siteCode, assetId, operator) {
  const asset = await getAsset(assetId);
  if (!asset || asset.status !== `At WSW: ${siteCode}`) throw new BusinessError('not currently at WSW here');
  return db.transaction(async (tx) => {
    await tx.assets.updateOne({ _id: assetId }, { $set: { status: 'Available at DC', home_site_code: siteCode } });
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
    await tx.assets.updateOne({ _id: assetId }, {
      $set: {
        status: 'Damaged / Written Off',
        stage: 0,
        outstanding_reason: null,
        outstanding_since: null,
        manifest_id: null,
        manifest_kind: null,
        transfer_to_code: null,
      },
    });
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
    await tx.assets.updateOne({ _id: assetId }, { $set: { status: 'In Maintenance', outstanding_reason: null } });
    await logCustody(tx, assetId, 'Maintenance Scan-Out — ' + reason, operator);
    return {};
  });
}
async function maintenanceIn(siteCode, assetId, operator) {
  const asset = await getAsset(assetId);
  if (!asset || asset.status !== 'In Maintenance') throw new BusinessError('not currently in maintenance');
  return db.transaction(async (tx) => {
    await tx.assets.updateOne({ _id: assetId }, { $set: { status: 'Available at DC', home_site_code: siteCode } });
    await logCustody(tx, assetId, 'Maintenance Scan-In — repaired, returned to active fleet', operator);
    return {};
  });
}

// ===================== GLS Vendor Custody =====================
async function glsCustodyOut(siteCode, assetId, glsSite, operator) {
  const asset = await getAsset(assetId);
  if (!asset || asset.home_site_code !== siteCode || asset.status !== 'Available at DC') throw new BusinessError('not available at this DC');
  return db.transaction(async (tx) => {
    await tx.assets.updateOne({ _id: assetId }, { $set: { status: `With GLS Vendor: ${glsSite}`, outstanding_reason: null } });
    await logCustody(tx, assetId, 'GLS Vendor Custody — transferred to ' + glsSite, operator);
    return {};
  });
}
async function glsCustodyIn(siteCode, assetId, operator) {
  const asset = await getAsset(assetId);
  if (!asset || !asset.status.startsWith('With GLS Vendor')) throw new BusinessError('not currently with GLS');
  return db.transaction(async (tx) => {
    await tx.assets.updateOne({ _id: assetId }, { $set: { status: 'Available at DC', home_site_code: siteCode } });
    await logCustody(tx, assetId, 'GLS Vendor Custody — returned to ' + siteCode, operator);
    return {};
  });
}

// ===================== Inter-DC Transfer =====================
async function interDcOut(siteCode, assetId, toSiteCode, operator) {
  const asset = await getAsset(assetId);
  if (!asset || asset.home_site_code !== siteCode || asset.status !== 'Available at DC') throw new BusinessError('not available at this DC');
  return db.transaction(async (tx) => {
    await tx.assets.updateOne({ _id: assetId }, {
      $set: { status: `Inter-DC Transfer to ${toSiteCode}`, transfer_to_code: toSiteCode, outstanding_reason: null },
    });
    await logCustody(tx, assetId, 'Inter-DC Transfer — scanned out to ' + toSiteCode, operator);
    return {};
  });
}
async function interDcIn(siteCode, assetId, operator) {
  const asset = await getAsset(assetId);
  if (!asset || asset.transfer_to_code !== siteCode || !asset.status.startsWith('Inter-DC Transfer')) throw new BusinessError('not an inbound transfer here');
  return db.transaction(async (tx) => {
    await tx.assets.updateOne({ _id: assetId }, { $set: { status: 'Available at DC', home_site_code: siteCode, transfer_to_code: null } });
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
