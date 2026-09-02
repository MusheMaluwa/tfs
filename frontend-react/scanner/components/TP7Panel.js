// scanner/components/TP7Panel.js
//
// TP7 — DC Return Receipt, and the one non-standard path reached from
// inside a touch point rather than from the picker: routing a return
// to a returns facility instead of back to this DC. Both go to the
// same endpoint; `isReturnsFacility` is what changes the resulting
// asset status (stateMachine.tp7ReturnReceipt).

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { useScanBuffer, ScanRow, PillGrid } from './ScanInput.js';
import { Panel } from './Panel.js';
const h = React.createElement;

export function TP7Panel({ api, session, returnsSites, onDone, onBack }) {
  const [manifests, setManifests] = React.useState(null);
  const [loadErr, setLoadErr] = React.useState(null);
  const [manifestId, setManifestId] = React.useState(null);
  const [facility, setFacility] = React.useState('');
  const { scanned, err, setErr, add } = useScanBuffer();
  const [busy, setBusy] = React.useState(false);
  const idemKey = React.useRef(newIdempotencyKey());

  React.useEffect(() => {
    let cancelled = false;
    // stage 6 = staged at TP6, in transit back to a DC.
    api.getManifests({ kind: 'return', stage: 6 })
      .then((all) => {
        if (cancelled) return;
        setManifests(all);
        if (all.length === 1) setManifestId(all[0].id);
      })
      .catch((e) => { if (!cancelled) { setManifests([]); setLoadErr(e.message); } });
    return () => { cancelled = true; };
  }, [api]);

  React.useEffect(() => {
    if (!facility && returnsSites.length) setFacility(returnsSites[0]);
  }, [returnsSites, facility]);

  const m = manifests && manifests.find((mm) => mm.id === manifestId);
  const expected = m ? (m.assets || []).filter((a) => a.expected).map((a) => a.asset_id) : [];

  function scan(raw) {
    const id = String(raw).trim();
    if (!expected.includes(id)) { setErr('Not on this return manifest.'); return; }
    add(id);
  }

  // One submit path, two destinations. An idempotency key is generated
  // per attempt here rather than per mount, because the two buttons are
  // genuinely different requests.
  async function commit(destination, isReturnsFacility, message) {
    setBusy(true); setErr(null);
    try {
      await api.tp7ReturnReceipt(manifestId, scanned, destination, isReturnsFacility, idemKey.current + (isReturnsFacility ? ':rf' : ''));
      onDone(message);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  if (manifests === null) {
    return h(Panel, { title: 'TP7 — Return Receipt', onBack }, h('div', { className: 'desc' }, 'Loading…'));
  }

  const outstanding = expected.filter((id) => !scanned.includes(id));
  const pct = expected.length ? Math.round((expected.length - outstanding.length) / expected.length * 100) : 0;

  return h(Panel, { title: 'TP7 — Return Receipt', onBack },
    loadErr && h('div', { className: 'alert warn' }, loadErr),
    !m
      ? (manifests.length === 0
        ? h('div', { className: 'empty-note' }, 'No return manifests awaiting receipt.')
        : h('div', { className: 'tp-pick-list' },
          manifests.map((mm) => h('button', {
            type: 'button', key: mm.id, className: 'tp-pick', onClick: () => setManifestId(mm.id),
          },
            h('div', { className: 'pk-id' }, mm.id),
            h('div', { className: 'pk-sub' },
              'From ' + (mm.origin_hub_code || '—') + ' · ' + (mm.assets || []).filter((a) => a.expected).length + ' assets')
          ))
        ))
      : h(React.Fragment, null,
        h('div', { className: 'desc' }, m.id, ' returning from ', m.origin_hub_code || '—', '.'),
        h(ScanRow, { onScan: scan }),
        h('div', { className: 'progress-row' },
          h('div', { className: 'progress-bar' }, h('div', { className: 'fill', style: { width: pct + '%' } })),
          h('div', { className: 'progress-label' }, (expected.length - outstanding.length) + ' / ' + expected.length)
        ),
        h(PillGrid, {
          pills: expected.map((id) => ({ id, cls: scanned.includes(id) ? 'scanned' : 'pending' })),
          emptyNote: 'This manifest has no expected assets.',
        }),
        outstanding.length
          ? h('div', { className: 'alert warn' }, outstanding.length + ' not yet returned — will be flagged outstanding.')
          : h('div', { className: 'alert ok' }, 'All matched.'),
        err && h('div', { className: 'alert warn' }, err),
        h('div', { className: 'submit-row' },
          h('button', {
            type: 'button', className: 'btn primary block', disabled: busy,
            onClick: () => commit(session.site, false, 'Return receipt confirmed: ' + manifestId),
          }, busy ? 'Confirming…' : 'Confirm return receipt at ' + session.site)),

        h('div', { className: 'branch-block' },
          h('div', { className: 'desc' }, '⎇ Non-standard path: not going back to this DC?'),
          h('div', { className: 'field' },
            h('label', null, 'Route to returns facility instead'),
            h('select', { value: facility, onChange: (e) => setFacility(e.target.value) },
              returnsSites.map((r) => h('option', { key: r, value: r }, r))),
            returnsSites.length === 0 && h('div', { className: 'empty-note' }, 'No returns facilities registered.')
          ),
          h('button', {
            type: 'button', className: 'btn block', disabled: busy || !facility,
            onClick: () => commit(facility, true, 'Routed to returns facility: ' + facility),
          }, 'Route to returns facility')
        )
      )
  );
}
