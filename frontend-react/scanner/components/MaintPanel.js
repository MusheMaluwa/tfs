// scanner/components/MaintPanel.js
//
// Maintenance Scan-Out / Scan-In — non-linear, and one of the three
// flows that are two half-forms in one panel. Out needs a reason typed
// alongside the barcode, so it is a fill-only field plus a button; in
// is a plain scan, because a repaired asset needs nothing said about
// it.

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { ScanRow, ScanField, PillGrid } from './ScanInput.js';
import { Panel, SubHead } from './Panel.js';
import { useFleet } from './useFleet.js';
const h = React.createElement;

export function MaintPanel({ api, session, showToast, onBack }) {
  const { assets, error, reload } = useFleet(api);
  const [outId, setOutId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const inMaint = (assets || []).filter((a) => a.status === 'In Maintenance' && a.home_site_code === session.site);

  async function scanOut() {
    const id = outId.trim();
    if (!id) { setErr('Scan or enter a barcode first.'); return; }
    setBusy(true); setErr(null);
    try {
      await api.maintenanceOut(id, reason.trim() || 'No reason provided', newIdempotencyKey());
      setOutId(''); setReason('');
      showToast(id + ' sent to maintenance.');
      reload();
    } catch (e) {
      setErr(e.message);
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function scanIn(raw) {
    const id = String(raw).trim();
    if (!id || busy) return;
    setBusy(true); setErr(null);
    try {
      await api.maintenanceIn(id, newIdempotencyKey());
      showToast(id + ' returned to active fleet.');
      reload();
    } catch (e) {
      setErr(e.message);
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return h(Panel, { title: 'Maintenance', onBack },
    h('div', { className: 'desc' },
      'Scan out a Rolltainer going for repair/service, or scan one back in once it\u2019s fixed.'),
    error && h('div', { className: 'alert warn' }, error),

    h(SubHead, null, 'Scan out for maintenance'),
    h(ScanField, { value: outId, onChange: setOutId }),
    h('div', { className: 'field' },
      h('label', null, 'Reason'),
      h('input', {
        type: 'text', placeholder: 'e.g. Wheel replacement',
        value: reason, onChange: (e) => setReason(e.target.value),
      })
    ),
    h('button', { type: 'button', className: 'btn primary block', disabled: busy, onClick: scanOut },
      'Send to maintenance'),

    h(SubHead, null, 'Currently in maintenance at ' + session.site),
    assets === null
      ? h('div', { className: 'empty-note' }, 'Loading…')
      : h(PillGrid, { pills: inMaint.map((a) => ({ id: a.id, cls: 'pending' })), emptyNote: 'None.' }),
    h(ScanRow, { onScan: scanIn, autoFocus: false, placeholder: 'Scan a repaired asset back in…' }),
    err && h('div', { className: 'alert warn' }, err)
  );
}
