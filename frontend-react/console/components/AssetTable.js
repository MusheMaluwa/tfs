// console/components/AssetTable.js
//
// The filterable asset table. Both console tabs show one — the
// dashboard filters by rollup status, the registry by type — so it
// takes the columns it should render rather than each tab keeping its
// own near-identical copy.

import React from 'react';
import { fmtTs, daysSince, statusChipClass, assetLocation, ageBasis } from '../../shared/format.js';
const h = React.createElement;

/** Applies the console's three filters. Exported so it can be tested
 *  without rendering anything. */
export function filterAssets(assets, { type, status, search }, rollupFn) {
  const q = (search || '').trim().toLowerCase();
  return assets
    .filter((a) => {
      if (type && a.type !== type) return false;
      if (status && rollupFn(a) !== status) return false;
      if (q && !a.id.toLowerCase().includes(q)) return false;
      return true;
    })
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
}

function StatusCell({ asset }) {
  const outstanding = !!asset.outstanding_reason;
  return h('span', { className: 'chip ' + (outstanding ? 'c-outstanding' : statusChipClass(asset.status)) },
    h('span', { className: 'dot' }),
    outstanding ? 'Outstanding' : asset.status);
}

const COLUMNS = {
  barcode:  { label: 'Barcode',  render: (a) => h('span', { className: 'mono strong' }, a.id) },
  type:     { label: 'Type',     render: (a) => a.type },
  status:   { label: 'Status',   render: (a) => h(StatusCell, { asset: a }) },
  location: { label: 'Location', render: (a) => assetLocation(a) },
  homeSite: { label: 'Home Site', render: (a) => a.home_site_code },
  age:      { label: 'Age (days since last scan)', render: (a) => h('span', { className: 'mono dim' }, daysSince(ageBasis(a))) },
  registered: { label: 'Registered', render: (a) => h('span', { className: 'mono dim' }, fmtTs(a.registered_at)) },
};

export function AssetTable({ assets, columns, onRowClick, emptyNote = 'No matching assets.' }) {
  const cols = columns.map((c) => ({ key: c, ...COLUMNS[c] }));

  return h('div', { className: 'table-scroll' },
    h('table', { className: 'reg' },
      h('thead', null, h('tr', null, cols.map((c) => h('th', { key: c.key }, c.label)))),
      h('tbody', null,
        assets.length === 0
          ? h('tr', null, h('td', { colSpan: cols.length, className: 'empty-note' }, emptyNote))
          : assets.map((a) => h('tr', {
              key: a.id,
              onClick: () => onRowClick && onRowClick(a.id),
              className: onRowClick ? 'clickable' : undefined,
            }, cols.map((c) => h('td', { key: c.key }, c.render(a)))))
      )
    )
  );
}

/** The type / status / search filter bar above a table. */
export function FilterBar({ value, onChange, statusOptions, typeOptions, onClear }) {
  return h('div', { className: 'filters' },
    h('select', {
      value: value.type, 'aria-label': 'Filter by asset type',
      onChange: (e) => onChange({ ...value, type: e.target.value }),
    },
      h('option', { value: '' }, 'All asset types'),
      typeOptions.map((t) => h('option', { key: t, value: t }, t))
    ),
    statusOptions && h('select', {
      value: value.status, 'aria-label': 'Filter by status',
      onChange: (e) => onChange({ ...value, status: e.target.value }),
    },
      h('option', { value: '' }, 'All statuses'),
      statusOptions.map((s) => h('option', { key: s, value: s }, s))
    ),
    h('input', {
      type: 'search', placeholder: 'Search barcode…', value: value.search,
      'aria-label': 'Search barcode',
      onChange: (e) => onChange({ ...value, search: e.target.value }),
    }),
    onClear && h('button', { type: 'button', className: 'btn sm', onClick: onClear }, 'Clear')
  );
}
