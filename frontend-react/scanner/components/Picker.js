// scanner/components/Picker.js
//
// After login: the operator sees only the movements their own role
// performs. Big tap targets, nothing else on screen — this is used
// one-handed, on a phone, in a warehouse.
//
// Two groups, same as frontend/mercury-scanner.html: the numbered
// steps of the dispatch loop, then the non-linear movements that
// happen outside it, dashed and violet so they read as a branch off
// the main flow rather than a step in it.

import React from 'react';
import { TP_META, NONLINEAR_META, roleDef } from './constants.js';
const h = React.createElement;

function Card({ tp, badge, extraClass, onSelect }) {
  return h('button', {
    type: 'button',
    className: 'tp-card' + (extraClass ? ' ' + extraClass : ''),
    onClick: () => onSelect(tp.id),
  },
    h('div', null,
      h('div', { className: 'tp-num' }, badge),
      h('div', { className: 'tp-title' }, tp.title),
      h('div', { className: 'tp-loc' }, tp.location)
    ),
    h('div', { className: 'arrow' }, '→')
  );
}

export function Picker({ session, onSelect, onLogout }) {
  const def = roleDef(session.role);
  const myTPs = TP_META.filter((tp) => tp.role === session.role);
  const myOther = NONLINEAR_META.filter((nl) => nl.role === session.role);

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
            myTPs.map((tp) => h(Card, {
              key: tp.id, tp, onSelect,
              badge: (tp.labelPrefix || 'TP') + tp.seq,
            })))
    ),
    myOther.length > 0 && h('div', { className: 'panel' },
      h('h2', null, 'Other movements'),
      h('div', { className: 'desc' }, 'Non-linear asset events, outside the standard dispatch loop.'),
      h('div', { className: 'tp-list' },
        myOther.map((nl) => h(Card, {
          key: nl.id, tp: nl, onSelect, extraClass: 'other', badge: '⎇ NON-LINEAR',
        })))
    ),
    h('footer', null, 'TFS LOGISTICS SCANNER — LIVE API')
  );
}
