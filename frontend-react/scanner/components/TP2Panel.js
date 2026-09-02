// scanner/components/TP2Panel.js
//
// TP2 — DC Dispatch Close. Pick the open manifest, confirm the
// destination hub, scan everything onto the vehicle, then lock it.
// Anything expected but not scanned comes back from the API as
// `missing` and is flagged outstanding server-side.
//
// This is the reference implementation for the remaining touch points:
// it shows the full pattern — fetch on mount, pick-if-many /
// auto-select-if-one, a scan buffer, and a submit that reports through
// onDone.

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { useScanBuffer, ScanRow, PillGrid } from './ScanInput.js';
const h = React.createElement;

export function TP2Panel({ api, session, hubSites, onDone, onBack }) {
  const [manifests, setManifests] = React.useState(null);
  const [loadErr, setLoadErr] = React.useState(null);
  const [manifestId, setManifestId] = React.useState(null);
  const [hub, setHub] = React.useState('');
  const { scanned, err, setErr, add } = useScanBuffer();
  const [busy, setBusy] = React.useState(false);
  const idemKey = React.useRef(newIdempotencyKey());

  React.useEffect(() => {
    let cancelled = false;
    // stage 1 = opened at TP1 and not yet closed.
    api.getManifests({ kind: 'dispatch', stage: 1 })
      .then((all) => {
        if (cancelled) return;
        const mine = all.filter((m) => m.origin_dc_code === session.site);
        setManifests(mine);
        if (mine.length === 1) setManifestId(mine[0].id);
      })
      .catch((e) => { if (!cancelled) { setManifests([]); setLoadErr(e.message); } });
    return () => { cancelled = true; };
  }, [api, session.site]);

  React.useEffect(() => { if (!hub && hubSites.length) setHub(hubSites[0]); }, [hubSites, hub]);

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const result = await api.tp2Close(manifestId, hub, scanned, idemKey.current);
      const missing = result.missing || [];
      const tail = missing.length ? ' (' + missing.length + ' missing, flagged outstanding)' : '';
      onDone('Closed & locked: ' + manifestId + tail);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const back = h('button', { type: 'button', className: 'back-link', onClick: onBack }, '‹ Touch points');

  if (manifests === null) {
    return h('div', null, back,
      h('div', { className: 'panel' },
        h('h2', null, 'TP2 — Dispatch Close'),
        h('div', { className: 'desc' }, 'Loading…')));
  }

  const m = manifests.find((mm) => mm.id === manifestId);
  const expected = m ? (m.assets || []).filter((a) => a.expected) : [];
  const scannedExpected = expected.filter((a) => scanned.includes(a.asset_id));
  const unexpected = scanned.filter((id) => !expected.some((a) => a.asset_id === id));
  const pct = expected.length ? Math.round(scannedExpected.length / expected.length * 100) : 0;

  return h('div', null, back,
    h('div', { className: 'panel' },
      h('h2', null, 'TP2 — Dispatch Close'),
      loadErr && h('div', { className: 'alert warn' }, loadErr),

      !m
        ? (manifests.length === 0
          ? h('div', { className: 'empty-note' }, 'No open dispatch waiting to be closed.')
          : h('div', { className: 'tp-pick-list' },
            manifests.map((mm) => h('button', {
              type: 'button', key: mm.id, className: 'tp-pick', onClick: () => setManifestId(mm.id),
            },
              h('div', { className: 'pk-id' }, mm.id),
              h('div', { className: 'pk-sub' }, (mm.assets || []).filter((a) => a.expected).length + ' assets expected')
            ))
          ))
        : h(React.Fragment, null,
          h('div', { className: 'desc' }, m.id, ' · confirm everything is loaded onto the TDT vehicle.'),
          h('div', { className: 'field' },
            h('label', null, 'Destination hub'),
            h('select', { value: hub, onChange: (e) => setHub(e.target.value) },
              hubSites.map((hs) => h('option', { key: hs, value: hs }, hs)))
          ),
          h(ScanRow, { onScan: add }),
          h('div', { className: 'progress-row' },
            h('div', { className: 'progress-bar' },
              h('div', { className: 'fill', style: { width: pct + '%' } })),
            h('div', { className: 'progress-label' }, scannedExpected.length + ' / ' + expected.length)
          ),
          h(PillGrid, {
            pills: expected
              .map((a) => ({ id: a.asset_id, cls: scanned.includes(a.asset_id) ? 'scanned' : 'pending' }))
              .concat(unexpected.map((id) => ({ id, cls: 'unexpected' }))),
            emptyNote: 'This manifest has no expected assets.',
          }),
          unexpected.length > 0 && h('div', { className: 'alert info' },
            unexpected.length + ' scanned asset(s) not on this manifest — the API will log them as Unexpected Asset exceptions.'),
          err && h('div', { className: 'alert warn' }, err),
          h('div', { className: 'submit-row' },
            h('button', { type: 'button', className: 'btn primary block', disabled: busy || !hub, onClick: confirm },
              busy ? 'Closing…' : 'Close & lock'))
        )
    )
  );
}
