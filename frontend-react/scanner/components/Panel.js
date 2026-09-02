// scanner/components/Panel.js
//
// The frame every touch-point panel sits in — back link, card, title.
// Pulled out so eleven panels don't each repeat the same three
// elements, and so the back affordance can never differ between them.

import React from 'react';
const h = React.createElement;

export function Panel({ title, onBack, children }) {
  return h('div', null,
    h('button', { type: 'button', className: 'back-link', onClick: onBack }, '‹ Touch points'),
    h('div', { className: 'panel' }, h('h2', null, title), children)
  );
}

/** A bold sub-heading inside a panel — the flows that scan out AND
 *  back in (maintenance, GLS, inter-DC) are two half-forms in one
 *  panel, exactly as in the vanilla scanner. */
export function SubHead({ children }) {
  return h('h3', { className: 'sub-head' }, children);
}
