// scanner/components/InterDcPanel.js
//
// Inter-DC Transfer — non-linear. Rebalances stock between DCs: scanned
// out here, scanned in at the receiving DC by an operator logged in
// there. The inbound list is what is currently in transit *to* this
// site, which is why it is keyed off transfer_to_code.

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { ScanRow, ScanField, PillGrid } from './ScanInput.js';
import { Panel, SubHead } from './Panel.js';
import { useFleet } from './useFleet.js';
const h = React.createElement;

export function InterDcPanel({ api, session, dcSites, showToast, onBack }) {
  const { assets, error, reload } = useFleet(api);
  const [outId, setOutId] = React.useState('');
  const [toDc, setToDc] = React.useState('');
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const otherDCs = React.useMemo(() => dcSites.filter((d) => d !== session.site), [dcSites, session.site]);
  React.useEffect(() => { if (!toDc && otherDCs.length) setToDc(otherDCs[0]); }, [otherDCs, toDc]);

  const inbound = (assets || []).filter(
    (a) => a.transfer_to_code === session.site && (a.status || '').startsWith('Inter-DC Transfer')
  );

  async function scanOut() {
    const id = outId.trim();
    if (!id) { setErr('Scan or enter a barcode first.'); return; }
    if (!toDc) { setErr('No other DC to transfer to.'); return; }
    setBusy(true); setErr(null);
    try {
      await api.interDcOut(id, toDc, newIdempotencyKey());
      setOutId('');
      showToast(id + ' transferred out to ' + toDc + '.');
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
      await api.interDcIn(id, newIdempotencyKey());
      showToast(id + ' received — added to active fleet here.');
      reload();
    } catch (e) {
      setErr(e.message);
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return h(Panel, { title: 'Inter-DC Transfer', onBack },
    h('div', { className: 'desc' }, 'Rebalance stock between DCs. Scan out here, scan in at the receiving DC.'),
    error && h('div', { className: 'alert warn' }, error),

    h(SubHead, null, 'Scan out to another DC'),
    h(ScanField, { value: outId, onChange: setOutId }),
    h('div', { className: 'field' },
      h('label', null, 'Destination DC'),
      h('select', { value: toDc, onChange: (e) => setToDc(e.target.value) },
        otherDCs.map((d) => h('option', { key: d, value: d }, d))),
      otherDCs.length === 0 && h('div', { className: 'empty-note' }, 'No other DC to transfer to.')
    ),
    h('button', { type: 'button', className: 'btn primary block', disabled: busy || !toDc, onClick: scanOut },
      'Transfer out'),

    h(SubHead, null, 'Inbound to ' + session.site),
    assets === null
      ? h('div', { className: 'empty-note' }, 'Loading…')
      : h(PillGrid, {
        pills: inbound.map((a) => ({ id: a.id, cls: 'pending' })),
        emptyNote: 'None in transit here.',
      }),
    h(ScanRow, { onScan: scanIn, autoFocus: false, placeholder: 'Scan an arriving asset…' }),
    err && h('div', { className: 'alert warn' }, err)
  );
}
