// scanner/components/NotPorted.js
//
// An explicit placeholder for the touch points not yet built in this
// React app, rather than a dead button that silently does nothing.
// Every one of them has a working implementation to copy from — the
// vanilla frontend/mercury-scanner.html — and a backend endpoint
// already waiting for it in shared/api.js.

import React from 'react';
import { TP_META } from './constants.js';
const h = React.createElement;

export function NotPorted({ tpId, onBack }) {
  const tp = TP_META.find((t) => t.id === tpId);
  return h('div', null,
    h('button', { type: 'button', className: 'back-link', onClick: onBack }, '‹ Touch points'),
    h('div', { className: 'panel' },
      h('h2', null, tp ? 'TP' + tp.seq + ' — ' + tp.title : String(tpId).toUpperCase()),
      h('div', { className: 'desc' }, 'Not yet built in this React app.'),
      h('div', { className: 'alert info' },
        'The API endpoint already exists (shared/api.js) and this flow works today in ' +
        'frontend/mercury-scanner.html. Copy TP2Panel.js as the template — see frontend-react/README.md.')
    )
  );
}
