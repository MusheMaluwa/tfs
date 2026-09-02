// scanner/components/WSW2Panel.js
//
// WSW2 — WSW Sort & Process. Scanning an asset that is sitting at this
// WSW releases it into the DC's active stock, ready for normal
// dispatch. Each scan commits on its own, and the list above reloads
// so the operator watches the pile shrink.

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { ScanRow, PillGrid } from './ScanInput.js';
import { Panel } from './Panel.js';
import { useFleet } from './useFleet.js';
const h = React.createElement;

export function WSW2Panel({ api, session, showToast, onBack }) {
  const { assets, error, reload } = useFleet(api);
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const atWsw = (assets || []).filter((a) => a.status === 'At WSW: ' + session.site);

  async function scan(raw) {
    const id = String(raw).trim();
    if (!id || busy) return;
    setBusy(true); setErr(null);
    try {
      await api.wsw2Sort(id, newIdempotencyKey());
      showToast(id + ' sorted and released to DC stock.');
      reload();
    } catch (e) {
      setErr(e.message);
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return h(Panel, { title: 'WSW2 — WSW Sort & Process', onBack },
    h('div', { className: 'desc' },
      'Scan each sorted asset to release it into this DC\u2019s active stock, ready for normal dispatch out to hubs.'),
    error && h('div', { className: 'alert warn' }, error),
    h('div', { className: 'desc sub-label' }, 'Currently at WSW, ', session.site, ':'),
    assets === null
      ? h('div', { className: 'empty-note' }, 'Loading…')
      : h(PillGrid, { pills: atWsw.map((a) => ({ id: a.id, cls: 'pending' })), emptyNote: 'None.' }),
    h(ScanRow, { onScan: scan }),
    err && h('div', { className: 'alert warn' }, err)
  );
}
