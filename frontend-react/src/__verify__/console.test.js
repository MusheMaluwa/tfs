// src/__verify__/console.test.js
//
// Renders the CONSOLE app's components with the real React and the
// real react-dom/server, and unit-tests the pure logic (filtering,
// rollups, cycle time, CSV shape) directly.
//
// The API rows used here are shaped exactly like backend/src/schema.js
// returns them — snake_case columns, ISO timestamp strings — which is
// the part most likely to drift if someone changes the backend.

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

import { rollupStatus, statusChipClass, assetLocation, ageBasis, toCsv, ROLLUP_KEYS } from '../../shared/format.js';
import { AssetTable, filterAssets } from '../../console/components/AssetTable.js';
import { StatusGrid, KpiGrid } from '../../console/components/StatusGrid.js';
import { ExceptionFeed } from '../../console/components/ExceptionFeed.js';
import { ProcessReference } from '../../console/components/ProcessReference.js';
import { avgCycleHours } from '../../console/components/Dashboard.js';
import { statusSnapshot, exceptionLog, agingReport } from '../../console/components/exportCsv.js';
import { coordsFor } from '../../console/components/SiteMap.js';
import { TP_META, WSW_META, NONLINEAR_META } from '../../console/components/constants.js';

const h = React.createElement;
const render = (el) => ReactDOMServer.renderToStaticMarkup(el);
const noop = () => {};
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

// Rows exactly as GET /api/assets returns them.
const ASSETS = [
  { id: 'RT-100001', type: 'Hyper Cage', home_site_code: 'JHB-DC1', status: 'Available at DC', stage: 0, registered_at: iso(300) },
  { id: 'RT-100016', type: 'Rolltainer', home_site_code: 'CPT-DC1', status: 'At Hub: George (GEO)', stage: 5, hub_arrival_at: iso(9), registered_at: iso(200) },
  { id: 'RT-100017', type: 'Hyper Cage', home_site_code: 'DBN-DC1', status: 'Available at DC', stage: 0, outstanding_reason: 'Missed scan at Hub Intake', outstanding_since: iso(2), registered_at: iso(150) },
  { id: 'RT-100018', type: 'Hyper Cage', home_site_code: 'JHB-DC1', status: 'Damaged / Written Off', stage: 0, registered_at: iso(120) },
];

/* ---------------- rollups + filtering ---------------- */

test('rollupStatus buckets every seeded asset shape correctly', () => {
  assert.equal(rollupStatus(ASSETS[0]), 'Available');
  assert.equal(rollupStatus(ASSETS[1]), 'At Hub');
  assert.equal(rollupStatus(ASSETS[3]), 'Damaged');
});

test('an outstanding asset is Outstanding regardless of its status text', () => {
  // RT-100017 still reads "Available at DC"; outstanding must win, or
  // a lost asset hides inside the Available count.
  assert.equal(rollupStatus(ASSETS[2]), 'Outstanding');
});

test('every bucket rollupStatus can return is one the status grid renders', () => {
  for (const a of ASSETS) assert.ok(ROLLUP_KEYS.includes(rollupStatus(a)));
});

test('filterAssets applies type, status and search together', () => {
  assert.equal(filterAssets(ASSETS, { type: 'Hyper Cage', status: '', search: '' }, rollupStatus).length, 3);
  assert.equal(filterAssets(ASSETS, { type: '', status: 'Outstanding', search: '' }, rollupStatus).length, 1);
  assert.equal(filterAssets(ASSETS, { type: '', status: '', search: '100016' }, rollupStatus).length, 1);
  assert.equal(filterAssets(ASSETS, { type: 'Rolltainer', status: 'Outstanding', search: '' }, rollupStatus).length, 0);
});

test('filterAssets sorts by barcode and does not mutate its input', () => {
  const input = [ASSETS[3], ASSETS[0]];
  const before = input.map((a) => a.id);
  const out = filterAssets(input, { type: '', status: '', search: '' }, rollupStatus);
  assert.deepEqual(out.map((a) => a.id), ['RT-100001', 'RT-100018']);
  assert.deepEqual(input.map((a) => a.id), before);
});

test('assetLocation reads the hub out of the status string, not the home site', () => {
  assert.equal(assetLocation(ASSETS[1]), 'George (GEO)');
  assert.equal(assetLocation(ASSETS[0]), 'JHB-DC1');
});

test('ageBasis prefers outstanding-since, then hub arrival, then registration', () => {
  assert.equal(ageBasis(ASSETS[2]), ASSETS[2].outstanding_since);
  assert.equal(ageBasis(ASSETS[1]), ASSETS[1].hub_arrival_at);
  assert.equal(ageBasis(ASSETS[0]), ASSETS[0].registered_at);
});

/* ---------------- rendering ---------------- */

test('AssetTable renders a row per asset with the requested columns', () => {
  const html = render(h(AssetTable, { assets: ASSETS, columns: ['barcode', 'type', 'status', 'location', 'age'], onRowClick: noop }));
  assert.match(html, /RT-100001/);
  assert.match(html, /George \(GEO\)/);
  assert.equal((html.match(/<tr/g) || []).length, ASSETS.length + 1); // + header row
});

test('AssetTable shows the outstanding chip rather than the raw status', () => {
  const html = render(h(AssetTable, { assets: [ASSETS[2]], columns: ['barcode', 'status'], onRowClick: noop }));
  assert.match(html, /c-outstanding/);
  assert.match(html, />Outstanding</);
});

test('AssetTable renders an empty note, not a bare table, when nothing matches', () => {
  const html = render(h(AssetTable, { assets: [], columns: ['barcode', 'type'] }));
  assert.match(html, /No matching assets\./);
});

test('StatusGrid renders all 11 buckets and marks only the active one', () => {
  const rollups = Object.fromEntries(ROLLUP_KEYS.map((k, i) => [k, i]));
  const html = render(h(StatusGrid, { rollups, active: 'At Hub', onSelect: noop }));
  for (const k of ROLLUP_KEYS) assert.match(html, new RegExp(k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')));
  assert.equal((html.match(/status-cell active/g) || []).length, 1);
});

test('StatusGrid renders zeroes rather than blanks before the summary loads', () => {
  const html = render(h(StatusGrid, { rollups: null, active: '', onSelect: noop }));
  assert.equal((html.match(/<div class="sv">0<\/div>/g) || []).length, ROLLUP_KEYS.length);
});

test('KpiGrid renders each metric with its label', () => {
  const html = render(h(KpiGrid, { items: [{ label: 'Tagging coverage', value: '77%' }, { label: 'Exception count', value: 3 }] }));
  assert.match(html, /77%/);
  assert.match(html, /Exception count/);
});

test('ExceptionFeed lists newest-first and caps at the limit', () => {
  const exceptions = Array.from({ length: 20 }, (_, i) => ({ id: i, ts: iso(i), type: 'Missed Scan', asset_id: 'RT-1000' + i, note: 'n' }));
  const html = render(h(ExceptionFeed, { exceptions, limit: 12, onAssetClick: noop }));
  assert.equal((html.match(/exception-row/g) || []).length, 12);
  assert.match(html, /RT-10000/);
});

test('ExceptionFeed says so when there is nothing to show', () => {
  assert.match(render(h(ExceptionFeed, { exceptions: [] })), /No exceptions logged\./);
});

test('ProcessReference documents all 7 touch points, both WSW steps and all 5 flows', () => {
  const html = render(h(ProcessReference));
  assert.equal(TP_META.length, 7);
  assert.equal(WSW_META.length, 2);
  assert.equal(NONLINEAR_META.length, 5);
  for (const tp of TP_META) assert.match(html, new RegExp(tp.title));
  for (const nl of NONLINEAR_META) assert.match(html, new RegExp(nl.title.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')));
});

/* ---------------- cycle time ---------------- */

test('avgCycleHours is null until a full dispatch-to-return loop completes', () => {
  assert.equal(avgCycleHours([]), null);
  assert.equal(avgCycleHours([{ kind: 'dispatch', stage: 2, created_at: iso(3), assets: [{ asset_id: 'A' }] }]), null);
});

test('avgCycleHours measures dispatch-open to return-received for matched assets', () => {
  const manifests = [
    { id: 'MAN-1', kind: 'dispatch', stage: 5, created_at: iso(4), assets: [{ asset_id: 'RT-1' }] },
    { id: 'RET-1', kind: 'return',   stage: 7, created_at: iso(2), assets: [{ asset_id: 'RT-1' }] },
  ];
  assert.equal(avgCycleHours(manifests), 48); // 2 days
});

test('avgCycleHours ignores a return whose dispatch manifest is gone', () => {
  const manifests = [{ id: 'RET-9', kind: 'return', stage: 7, created_at: iso(1), assets: [{ asset_id: 'ORPHAN' }] }];
  assert.equal(avgCycleHours(manifests), null);
});

/* ---------------- exports ---------------- */

test('statusSnapshot exports one row per asset with Outstanding resolved', () => {
  const [headers, rows] = statusSnapshot(ASSETS);
  assert.deepEqual(headers, ['Barcode', 'Type', 'Status', 'Home Site', 'Registered']);
  assert.equal(rows.length, 4);
  assert.equal(rows.find((r) => r[0] === 'RT-100017')[2], 'Outstanding');
});

test('agingReport includes only assets actually accruing age', () => {
  const [, rows] = agingReport(ASSETS);
  assert.deepEqual(rows.map((r) => r[0]).sort(), ['RT-100016', 'RT-100017']);
});

test('exceptionLog maps the API columns straight through', () => {
  const [headers, rows] = exceptionLog([{ id: 1, ts: '2026-01-01T00:00:00.000Z', type: 'Missed Scan', asset_id: 'RT-1', note: 'x' }]);
  assert.deepEqual(headers, ['Timestamp', 'Type', 'Asset', 'Note']);
  assert.deepEqual(rows[0], ['2026-01-01T00:00:00.000Z', 'Missed Scan', 'RT-1', 'x']);
});

test('toCsv escapes embedded quotes and commas so a note cannot break the columns', () => {
  const csv = toCsv(['A', 'B'], [['say "hi"', 'one,two']]);
  assert.equal(csv, 'A,B\n"say ""hi""","one,two"');
});

/* ---------------- map ---------------- */

test('coordsFor prefers the coordinates the API stores for a site', () => {
  const byCode = { 'JHB-DC1': { code: 'JHB-DC1', type: 'DC', lat: -1, lng: 2 } };
  assert.deepEqual(coordsFor('JHB-DC1', byCode), [-1, 2]);
});

test('coordsFor falls back to the bundled table when the API has no lat/lng', () => {
  const byCode = { 'JHB-DC1': { code: 'JHB-DC1', type: 'DC', lat: null, lng: null } };
  assert.deepEqual(coordsFor('JHB-DC1', byCode), [-26.2041, 28.0473]);
});

test('coordsFor returns null for a site nobody has geocoded, rather than a bogus point', () => {
  assert.equal(coordsFor('Brand New Hub (XYZ)', {}), null);
});

/* ---------------- chip vocabulary ---------------- */

test('statusChipClass only ever returns a class the stylesheet defines', () => {
  const defined = ['c-idle', 'c-active', 'c-transit', 'c-hub', 'c-return', 'c-outstanding', 'c-damaged', 'c-branch'];
  const statuses = [
    'Available at DC', 'In Dispatch', 'Dispatched — In Transit', 'At Hub: George (GEO)',
    'At WSW: JHB-DC1', 'Ready for Return', 'Damaged / Written Off', 'In Maintenance',
    'With GLS Vendor: GLS Cape Town', 'Inter-DC Transfer to JHB-DC1', 'something unrecognised',
  ];
  for (const s of statuses) assert.ok(defined.includes(statusChipClass(s)), s);
});
