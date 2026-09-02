// console/components/ExceptionFeed.js
//
// Missed Scan, Unexpected Asset, Missing Asset, Aged at Hub, Overdue
// Return, Damaged — whatever the state machine has logged, newest
// first. GET /api/exceptions already returns them in that order.

import React from 'react';
import { fmtTs } from '../../shared/format.js';
const h = React.createElement;

export function ExceptionFeed({ exceptions, limit = 12, onAssetClick }) {
  if (!exceptions || exceptions.length === 0) {
    return h('div', { className: 'empty-note' }, 'No exceptions logged.');
  }
  return h('div', null,
    exceptions.slice(0, limit).map((e) => h('div', { className: 'exception-row', key: e.id },
      h('div', { className: 'ex-ts' }, fmtTs(e.ts)),
      h('div', null,
        h('div', { className: 'ex-type' }, e.type),
        h('div', null,
          onAssetClick
            ? h('button', { type: 'button', className: 'link-btn mono', onClick: () => onAssetClick(e.asset_id) }, e.asset_id)
            : h('span', { className: 'mono' }, e.asset_id),
          ' — ', e.note)
      ),
      h('div')
    ))
  );
}
