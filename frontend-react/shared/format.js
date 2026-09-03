// shared/format.js
//
// Pure formatting + status-derivation helpers. No React, no DOM, no
// fetch — which is exactly why they can be unit-tested directly and
// shared between both apps without dragging anything else along.
//
// One thing to watch: the backend stores timestamps as ISO 8601
// strings (see backend/src/schema.js), not epoch milliseconds like the
// old localStorage prototype did. Everything here takes the ISO string
// the API actually returns.

export function parseTs(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtTs(ts) {
  const d = parseTs(ts);
  if (!d) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function daysSince(ts) {
  const d = parseTs(ts);
  if (!d) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** The 11 dashboard buckets. Must stay in step with the identical
 *  function in backend/src/routes/dashboard.js — that one drives the
 *  cached counts, this one drives client-side table filtering. */
export function rollupStatus(asset) {
  if (asset.outstanding_reason) return 'Outstanding';
  const s = asset.status || '';
  if (s.startsWith('Available')) return 'Available';
  if (s.startsWith('In Dispatch')) return 'In Dispatch';
  if (s.includes('In Transit')) return 'In Transit';
  if (s.startsWith('At Hub')) return 'At Hub';
  if (s.startsWith('At WSW')) return 'At WSW';
  if (s.startsWith('Ready for Return')) return 'Ready for Return';
  if (s === 'Damaged / Written Off') return 'Damaged';
  if (s === 'In Maintenance') return 'Maintenance';
  if (s.startsWith('With GLS Vendor')) return 'GLS Custody';
  if (s.startsWith('Inter-DC Transfer')) return 'Inter-DC Transfer';
  return 'Available';
}

export const ROLLUP_KEYS = [
  'Available', 'In Dispatch', 'In Transit', 'At Hub', 'At WSW',
  'Ready for Return', 'Outstanding', 'Damaged', 'Maintenance',
  'GLS Custody', 'Inter-DC Transfer',
];

/** Maps a status to one of the .chip colour classes in tokens.css. */
export function statusChipClass(status) {
  const s = status || '';
  if (s.startsWith('Available')) return 'c-idle';
  if (s.startsWith('In Dispatch')) return 'c-active';
  if (s.includes('In Transit')) return 'c-transit';
  if (s.startsWith('At Hub')) return 'c-hub';
  if (s.startsWith('At WSW')) return 'c-branch';
  if (s.startsWith('Ready for Return')) return 'c-return';
  if (s === 'Damaged / Written Off') return 'c-damaged';
  if (s === 'In Maintenance') return 'c-branch';
  if (s.startsWith('With GLS Vendor')) return 'c-branch';
  if (s.startsWith('Inter-DC Transfer')) return 'c-branch';
  return 'c-idle';
}

/** Where an asset physically is right now, for the location column.
 *  "At Hub: George (GEO)" carries the hub in the status string itself;
 *  everything else sits at its home site. */
export function assetLocation(asset) {
  const s = asset.status || '';
  if (s.startsWith('At Hub: ')) return s.replace('At Hub: ', '');
  if (s.startsWith('At WSW: ')) return s.replace('At WSW: ', '');
  return asset.home_site_code || '—';
}

/** Whichever timestamp the "age" column should count from: how long
 *  it has been outstanding, else how long it has sat at a hub, else
 *  how long since it was registered. */
export function ageBasis(asset) {
  return asset.outstanding_since || asset.hub_arrival_at || asset.registered_at;
}

/** Serialises rows to CSV with RFC-4180 quoting. Returned as a string
 *  rather than downloaded here so it can be tested without a DOM. */
export function toCsv(headers, rows) {
  const cell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return [headers.join(',')].concat(rows.map((r) => r.map(cell).join(','))).join('\n');
}
