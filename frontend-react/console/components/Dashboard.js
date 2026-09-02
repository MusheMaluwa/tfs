// console/components/Dashboard.js
//
// The back-office monitoring tab: fleet status rollups, KPIs, a
// filterable table of every asset, the map, exports, and the exception
// feed.
//
// Every number here comes from the API, not from browser storage. The
// rollup counts specifically come from GET /api/dashboard/summary,
// which computes them over the whole fleet server-side (and caches for
// 20s) — the table below is a separate, filterable view of the asset
// rows themselves.

import React from 'react';
import { ROLLUP_KEYS, rollupStatus } from '../../shared/format.js';
import { ASSET_TYPES } from './constants.js';
import { StatusGrid, KpiGrid } from './StatusGrid.js';
import { AssetTable, FilterBar, filterAssets } from './AssetTable.js';
import { SiteMap } from './SiteMap.js';
import { ExceptionFeed } from './ExceptionFeed.js';
import { statusSnapshot, exceptionLog, agingReport, downloadCsv } from './exportCsv.js';
const h = React.createElement;

const EMPTY_FILTERS = { type: '', status: '', search: '' };

/** Average hours from a dispatch manifest being opened to the matching
 *  return manifest being received. Pure, so it is unit-tested directly.
 *  Returns null when nothing has completed a full loop yet — the UI
 *  shows an em dash rather than a misleading zero. */
export function avgCycleHours(manifests) {
  const completedReturns = manifests.filter((m) => m.kind === 'return' && m.stage === 7);
  if (completedReturns.length === 0) return null;

  const assetIds = (m) => (m.assets || []).map((a) => a.asset_id);
  let totalHrs = 0;
  let count = 0;

  completedReturns.forEach((ret) => {
    const ids = assetIds(ret);
    const dispatch = manifests.find((d) => d.kind === 'dispatch' && assetIds(d).some((id) => ids.includes(id)));
    if (!dispatch) return;
    const delta = new Date(ret.created_at).getTime() - new Date(dispatch.created_at).getTime();
    if (!Number.isFinite(delta)) return;
    totalHrs += delta / 3600000;
    count += 1;
  });

  return count ? Math.round(totalHrs / count) : null;
}

export function Dashboard({ data, lastUpdated, onAssetClick, showToast }) {
  const [filters, setFilters] = React.useState(EMPTY_FILTERS);
  const { summary, assets, exceptions, manifests, sites } = data;

  const rows = React.useMemo(
    () => filterAssets(assets, filters, rollupStatus),
    [assets, filters]
  );
  const cycle = React.useMemo(() => avgCycleHours(manifests), [manifests]);

  function exportReport(name, filename, build, input) {
    const [headers, csvRows] = build(input);
    downloadCsv(filename, headers, csvRows);
    showToast('Exported ' + filename);
  }

  return h(React.Fragment, null,
    h('div', { className: 'panel' },
      h('div', { className: 'panel-head' },
        h('div', null,
          h('h2', null, 'Real-Time Dashboard & Asset Status Monitoring'),
          h('div', { className: 'desc flush' }, 'Accessible to DC managers and hub supervisors.')),
        h('div', { className: 'refresh-note' },
          h('span', { className: 'pulse' }),
          ' Auto-refreshing every 60s · last updated ', lastUpdated)
      ),

      h('h3', null, 'Status ',
        h('span', { className: 'h3-hint' }, '— click to filter the table below')),
      h(StatusGrid, {
        rollups: summary ? summary.rollups : null,
        active: filters.status,
        onSelect: (status) => setFilters((f) => ({ ...f, status })),
      }),

      h('h3', null, 'KPI tracking'),
      h(KpiGrid, {
        items: [
          { label: 'Tagging coverage', value: (summary ? summary.kpis.taggingCoveragePct : 0) + '%' },
          { label: 'Avg. asset cycle time', value: cycle !== null ? cycle + 'h' : '—' },
          { label: 'Loss / outstanding rate', value: (summary ? summary.kpis.lossRatePct : 0) + '%' },
          { label: 'Exception count', value: summary ? summary.kpis.exceptionCount : 0 },
        ],
      }),

      h('h3', null, 'Filter'),
      h(FilterBar, {
        value: filters,
        onChange: setFilters,
        typeOptions: ASSET_TYPES,
        statusOptions: ROLLUP_KEYS,
        onClear: () => setFilters(EMPTY_FILTERS),
      }),
      h(AssetTable, {
        assets: rows,
        columns: ['barcode', 'type', 'status', 'location', 'age'],
        onRowClick: onAssetClick,
      })
    ),

    h('div', { className: 'panel' },
      h(SiteMap, { siteCounts: summary ? summary.siteCounts : {}, sites }),

      h('h3', null, 'Export reports'),
      h('div', { className: 'export-row' },
        h('button', {
          type: 'button', className: 'btn sm',
          onClick: () => exportReport('status', 'tfs-status-snapshot.csv', statusSnapshot, assets),
        }, 'Daily status snapshot (CSV)'),
        h('button', {
          type: 'button', className: 'btn sm',
          onClick: () => exportReport('exceptions', 'tfs-exception-log.csv', exceptionLog, exceptions),
        }, 'Exception log (CSV)'),
        h('button', {
          type: 'button', className: 'btn sm',
          onClick: () => exportReport('aging', 'tfs-aging-report.csv', agingReport, assets),
        }, 'Aging report (CSV)')
      ),

      h('h3', null, 'Exception feed'),
      h(ExceptionFeed, { exceptions, onAssetClick })
    )
  );
}
