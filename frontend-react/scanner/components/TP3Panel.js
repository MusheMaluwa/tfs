// scanner/components/TP3Panel.js
//
// TP3 — TDT Dispatch Intake. The driver scans each asset as it goes
// onto the vehicle. Anything on the manifest that never gets scanned
// comes back from the API as `pending` and is flagged server-side.

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { useScanBuffer, ScanRow, PillGrid } from './ScanInput.js';
import { Panel } from './Panel.js';
const h = React.createElement;

export function TP3Panel({ api, onDone, onBack }) {
  const [manifests, setManifests] = React.useState(null);
  const [loadErr, setLoadErr] = React.useState(null);
  const [manifestId, setManifestId] = React.useState(null);
  const { scanned, err, setErr, add } = useScanBuffer();
  const [busy, setBusy] = React.useState(false);
  const idemKey = React.useRef(newIdempotencyKey());

  React.useEffect(() => {
    let cancelled = false;
    // stage 2 = closed at TP2, waiting to be loaded onto a vehicle.
    api.getManifests({ kind: 'dispatch', stage: 2 })
      .then((all) => {
        if (cancelled) return;
        setManifests(all);
        if (all.length === 1) setManifestId(all[0].id);
      })
      .catch((e) => { if (!cancelled) { setManifests([]); setLoadErr(e.message); } });
    return () => { cancelled = true; };
  }, [api]);

  const m = manifests && manifests.find((mm) => mm.id === manifestId);
  const expected = m ? (m.assets || []).filter((a) => a.expected).map((a) => a.asset_id) : [];

  function scan(raw) {
    const id = String(raw).trim();
    if (!expected.includes(id)) { setErr('Not on this manifest.'); return; }
    add(id);
  }

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const result = await api.tp3Intake(manifestId, scanned, idemKey.current);
      const pending = result.pending || [];
      const tail = pending.length ? ' (' + pending.length + ' pending, flagged)' : '';
      onDone('Intake confirmed: ' + manifestId + tail);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  if (manifests === null) {
    return h(Panel, { title: 'TP3 — TDT Intake', onBack }, h('div', { className: 'desc' }, 'Loading…'));
  }

  const pending = expected.filter((id) => !scanned.includes(id));
  const pct = expected.length ? Math.round((expected.length - pending.length) / expected.length * 100) : 0;

  return h(Panel, { title: 'TP3 — TDT Intake', onBack },
    loadErr && h('div', { className: 'alert warn' }, loadErr),
    !m
      ? (manifests.length === 0
        ? h('div', { className: 'empty-note' }, 'No manifests waiting for intake.')
        : h('div', { className: 'tp-pick-list' },
          manifests.map((mm) => h('button', {
            type: 'button', key: mm.id, className: 'tp-pick', onClick: () => setManifestId(mm.id),
          },
            h('div', { className: 'pk-id' }, mm.id),
            h('div', { className: 'pk-sub' },
              'From ' + (mm.origin_dc_code || '—') + ' · ' + (mm.assets || []).filter((a) => a.expected).length + ' assets')
          ))
        ))
      : h(React.Fragment, null,
        h('div', { className: 'desc' }, m.id, ' from ', m.origin_dc_code || '—', '. Scan as loaded onto the vehicle.'),
        h(ScanRow, { onScan: scan }),
        h('div', { className: 'progress-row' },
          h('div', { className: 'progress-bar' }, h('div', { className: 'fill', style: { width: pct + '%' } })),
          h('div', { className: 'progress-label' }, (expected.length - pending.length) + ' / ' + expected.length)
        ),
        h(PillGrid, {
          pills: expected.map((id) => ({ id, cls: scanned.includes(id) ? 'scanned' : 'pending' })),
          emptyNote: 'This manifest has no expected assets.',
        }),
        pending.length
          ? h('div', { className: 'alert info' }, pending.length + ' pending.')
          : h('div', { className: 'alert ok' }, 'All matched.'),
        err && h('div', { className: 'alert warn' }, err),
        h('div', { className: 'submit-row' },
          h('button', { type: 'button', className: 'btn primary block', disabled: busy, onClick: confirm },
            busy ? 'Confirming…' : 'Confirm intake'))
      )
  );
}
