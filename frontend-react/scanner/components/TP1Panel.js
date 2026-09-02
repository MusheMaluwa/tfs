// scanner/components/TP1Panel.js
//
// TP1 — DC Dispatch Open. Scan each asset as it leaves the DC; the
// backend creates the dispatch manifest from whatever was scanned.

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { useScanBuffer, ScanRow, PillGrid } from './ScanInput.js';
const h = React.createElement;

export function TP1Panel({ api, session, onDone, onBack }) {
  const { scanned, err, setErr, add, remove } = useScanBuffer();
  const [busy, setBusy] = React.useState(false);
  // Generated once per panel mount, so a retry after a dropped
  // connection resolves to the same manifest instead of opening a
  // second one. See backend/README.md on idempotency.
  const idemKey = React.useRef(newIdempotencyKey());

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const result = await api.tp1Open(session.site, scanned, idemKey.current);
      onDone('Dispatch opened: ' + result.manifestId);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return h('div', null,
    h('button', { type: 'button', className: 'back-link', onClick: onBack }, '‹ Touch points'),
    h('div', { className: 'panel' },
      h('h2', null, 'TP1 — Dispatch Open'),
      h('div', { className: 'desc' }, session.site, ' — scan each asset as you load it for dispatch.'),
      h(ScanRow, { onScan: add }),
      h(PillGrid, { pills: scanned.map((id) => ({ id, cls: 'scanned' })) }),
      scanned.length > 0 && h('button', {
        type: 'button',
        className: 'link-btn',
        onClick: () => remove(scanned[scanned.length - 1]),
      }, 'Undo last scan'),
      err && h('div', { className: 'alert warn' }, err),
      h('div', { className: 'submit-row' },
        h('button', {
          type: 'button',
          className: 'btn primary block',
          disabled: !scanned.length || busy,
          onClick: confirm,
        }, busy ? 'Opening…' : 'Open dispatch (' + scanned.length + ')')
      )
    )
  );
}
