// console/components/exportCsv.js
//
// The three CSV reports on the dashboard. Each report's row-building is
// a pure function taking the data and returning [headers, rows], so the
// column contents are testable without a browser; downloadCsv is the
// thin DOM half that actually saves the file.

import { toCsv, daysSince, rollupStatus, ageBasis } from '../../shared/format.js';

export function statusSnapshot(assets) {
  return [
    ['Barcode', 'Type', 'Status', 'Home Site', 'Registered'],
    assets.map((a) => [
      a.id, a.type,
      a.outstanding_reason ? 'Outstanding' : a.status,
      a.home_site_code, a.registered_at,
    ]),
  ];
}

export function exceptionLog(exceptions) {
  return [
    ['Timestamp', 'Type', 'Asset', 'Note'],
    exceptions.map((e) => [e.ts, e.type, e.asset_id, e.note]),
  ];
}

/** Only assets actually accumulating age: sitting at a hub, or
 *  outstanding. A report listing the whole fleet would bury them. */
export function agingReport(assets) {
  return [
    ['Barcode', 'Status', 'Days at current status'],
    assets
      .filter((a) => a.hub_arrival_at || a.outstanding_reason)
      .map((a) => [a.id, rollupStatus(a), daysSince(ageBasis(a))]),
  ];
}

export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}
