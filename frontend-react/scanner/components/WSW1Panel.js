// scanner/components/WSW1Panel.js
//
// WSW1 — Wrong Source Warehouse Intake. Deliberately accepts anything
// scanned, expected or not: catching misrouted stock is the entire
// point, so there is no manifest to pick and no list to match against.
// Each scan is its own request, committed immediately.

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { ScanRow, PillGrid } from './ScanInput.js';
import { Panel } from './Panel.js';
const h = React.createElement;

export function WSW1Panel({ api, session, showToast, onBack }) {
  const [log, setLog] = React.useState([]);
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  async function scan(raw) {
    const id = String(raw).trim();
    if (!id || busy) return;
    setBusy(true); setErr(null);
    try {
      await api.wsw1Intake(id, newIdempotencyKey());
      setLog((prev) => (prev.includes(id) ? prev : [...prev, id]));
      showToast(id + ' received into WSW.');
    } catch (e) {
      setErr(e.message);
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return h(Panel, { title: 'WSW1 — WSW Intake', onBack },
    h('div', { className: 'desc' },
      'Scan any asset that has physically arrived at ', session.site,
      ' from another DC via the wrong-source route. It doesn\u2019t need to be expected — this catches misrouted stock.'),
    h(ScanRow, { onScan: scan }),
    err && h('div', { className: 'alert warn' }, err),
    log.length > 0 && h(React.Fragment, null,
      h('div', { className: 'desc sub-label' }, 'This session:'),
      h(PillGrid, { pills: log.map((id) => ({ id, cls: 'scanned' })) })
    )
  );
}
