// console/components/SiteManager.js
//
// Onboard and retire DCs, hubs, and returns facilities.
//
// Deleting a site that is still referenced by an asset or manifest is
// refused by the API with a 409 (backend/src/routes/sites.js). This
// component deliberately does NOT try to predict that client-side —
// the server is the authority on what is in use, and re-implementing
// the check here would only produce a second answer that could drift
// out of step with the first.

import React from 'react';
import { SITE_TYPES } from './constants.js';
const h = React.createElement;

function SiteColumn({ def, sites, onAdd, onRemove, busy }) {
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');

  const mine = sites.filter((s) => s.type === def.type);

  function submit() {
    const c = code.trim();
    if (!c) return;
    // Most DC codes are their own display name; only override when the
    // operator actually typed something different.
    onAdd(def.type, c, name.trim() || c, () => { setCode(''); setName(''); });
  }

  return h('div', { className: 'site-col' },
    h('h3', null, def.label),
    h('div', { className: 'site-add' },
      h('input', {
        type: 'text', value: code, placeholder: def.placeholder, 'aria-label': def.label + ' code',
        onChange: (e) => setCode(e.target.value),
        onKeyDown: (e) => { if (e.key === 'Enter') submit(); },
      }),
      h('input', {
        type: 'text', value: name, placeholder: 'Display name (optional)', 'aria-label': def.label + ' name',
        onChange: (e) => setName(e.target.value),
        onKeyDown: (e) => { if (e.key === 'Enter') submit(); },
      }),
      h('button', { type: 'button', className: 'btn primary sm', onClick: submit, disabled: busy || !code.trim() }, 'Add')
    ),
    h('div', { className: 'site-list' },
      mine.length === 0
        ? h('div', { className: 'empty-note' }, 'None yet.')
        : mine.map((s) => h('div', { className: 'site-row', key: s.code },
            h('span', { className: 'mono' }, s.code),
            h('button', {
              type: 'button', className: 'btn sm', disabled: busy,
              onClick: () => onRemove(s.code),
            }, 'Remove')
          ))
    )
  );
}

export function SiteManager({ sites, onAdd, onRemove, busy }) {
  return h('div', { className: 'panel' },
    h('h2', null, 'Distribution Centres, Hubs & Returns Facilities'),
    h('div', { className: 'desc' }, 'Onboard a site before assigning assets or manifests to it. A site still in use cannot be removed.'),
    h('div', { className: 'site-grid' },
      SITE_TYPES.map((def) => h(SiteColumn, { key: def.type, def, sites, onAdd, onRemove, busy }))
    )
  );
}
