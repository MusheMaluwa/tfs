// console/components/ProcessReference.js
//
// Static reference tables: the 7 touch points, the 2 WSW steps, and
// the 5 non-linear flows. Scanning happens in the separate scanner app
// on each operator's handheld — this is the copy managers and auditors
// read.

import React from 'react';
import { TP_META, WSW_META, NONLINEAR_META } from './constants.js';
const h = React.createElement;

function RefTable({ headers, rows }) {
  return h('div', { className: 'table-scroll' },
    h('table', { className: 'ref' },
      h('thead', null, h('tr', null, headers.map((x) => h('th', { key: x }, x)))),
      h('tbody', null, rows.map((cells, i) =>
        h('tr', { key: i }, cells.map((c, j) => h('td', { key: j }, c)))))
    )
  );
}

export function ProcessReference() {
  return h('div', { className: 'panel' },
    h('h3', { className: 'flush' }, 'Process reference — the 7 touch points'),
    h('div', { className: 'desc' },
      'Scanning itself happens in the TFS Logistics Scanner app on each operator’s phone or handheld — this is the reference copy for training and audit.'),
    h(RefTable, {
      headers: ['#', 'Touch Point', 'Location', 'What happens'],
      rows: TP_META.map((tp) => [tp.seq, tp.title, tp.location, tp.what]),
    }),

    h('h3', null, 'Wrong Source Warehouse (WSW)'),
    h('div', { className: 'desc' },
      'Misrouted stock — assets dispatched to the wrong DC are received, sorted, and processed back into normal outbound flow.'),
    h(RefTable, {
      headers: ['#', 'Touch Point', 'Location', 'What happens'],
      rows: WSW_META.map((tp) => [tp.seq, tp.title, tp.location, tp.what]),
    }),

    h('h3', null, 'Non-linear operational flows'),
    h('div', { className: 'desc' },
      'Lifecycle events that occur outside the standard DC-to-hub-to-DC dispatch loop.'),
    h(RefTable, {
      headers: ['Flow', 'Role', 'What happens'],
      rows: NONLINEAR_META.map((nl) => [nl.title, nl.role, nl.what]),
    })
  );
}
