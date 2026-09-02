// scanner/components/Picker.js
//
// After login: the operator sees only the touch points their own role
// performs. Big tap targets, nothing else on screen — this is used
// one-handed, on a phone, in a warehouse.

import React from 'react';
import { TP_META, roleDef } from './constants.js';
const h = React.createElement;

export function Picker({ session, ported, onSelect, onLogout }) {
  const def = roleDef(session.role);
  const myTPs = TP_META.filter((tp) => tp.role === session.role);

  return h(React.Fragment, null,
    h('header', { className: 'top' },
      h('div', { className: 'brand' }, h('div', { className: 'mark' }, 'TFS'), h('h1', null, 'TFS LOGISTICS')),
      h('div', { className: 'session-tag' },
        h('span', null, h('b', null, def ? def.title : session.role), session.site ? ' · ' + session.site : ''),
        h('button', { type: 'button', onClick: onLogout }, 'Switch')
      )
    ),
    h('div', { className: 'panel' },
      h('h2', null, 'Your touch points'),
      h('div', { className: 'desc' }, session.opName, ' — tap a step to scan.'),
      myTPs.length === 0
        ? h('div', { className: 'empty-note' }, 'No touch points for this role.')
        : h('div', { className: 'tp-list' },
            myTPs.map((tp) => {
              const live = !ported || ported.includes(tp.id);
              return h('button', {
                type: 'button', key: tp.id,
                className: 'tp-card' + (live ? '' : ' other'),
                onClick: () => onSelect(tp.id),
              },
                h('div', null,
                  h('div', { className: 'tp-num' }, 'TP' + tp.seq),
                  h('div', { className: 'tp-title' }, tp.title),
                  h('div', { className: 'tp-loc' }, tp.location)
                ),
                h('div', { className: 'arrow' }, '→')
              );
            })
          )
    ),
    h('footer', null, 'TFS LOGISTICS SCANNER — LIVE API')
  );
}
