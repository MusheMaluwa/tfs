// console/components/StatusGrid.js
//
// The 11 status counters across the top of the dashboard. Each one is
// a button: clicking it filters the table below, clicking the same one
// again clears the filter.
//
// The counts come from GET /api/dashboard/summary, which computes them
// server-side over the whole fleet and caches for 20s — so they stay
// correct even though the table below only holds the rows it fetched.

import React from 'react';
import { ROLLUP_KEYS } from '../../shared/format.js';
const h = React.createElement;

export function StatusGrid({ rollups, active, onSelect }) {
  return h('div', { className: 'status-grid' },
    ROLLUP_KEYS.map((k) => h('button', {
      type: 'button',
      key: k,
      className: 'status-cell' + (active === k ? ' active' : ''),
      'aria-pressed': active === k,
      onClick: () => onSelect(active === k ? '' : k),
    },
      h('div', { className: 'sv' }, (rollups && rollups[k]) || 0),
      h('div', { className: 'sl' }, k)
    ))
  );
}

export function KpiGrid({ items }) {
  return h('div', { className: 'kpi-grid' },
    items.map((it) => h('div', { className: 'kpi', key: it.label },
      h('div', { className: 'kv' }, it.value),
      h('div', { className: 'kl' }, it.label),
      it.note && h('div', { className: 'kt' }, it.note)
    ))
  );
}
