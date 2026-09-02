// scanner/components/TP5Panel.js
//
// TP5 — Hub Intake. Assets are scanned as they come off the vehicle at
// the hub. Something that arrives but isn't on the manifest is kept
// visible as an unexpected arrival; the API logs it as an Unexpected
// Asset exception and does not silently accept it into the manifest.

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { useScanBuffer, ScanRow, PillGrid } from './ScanInput.js';
import { Panel } from './Panel.js';
const h = React.createElement;

export function TP5Panel({ api, session, onDone, onBack }) {
  const [manifests, setManifests] = React.useState(null);
  const [loadErr, setLoadErr] = React.useState(null);
  const [manifestId, setManifestId] = React.useState(null);
  const [unexpected, setUnexpected] = React.useState([]);
  const { scanned, err, setErr, add } = useScanBuffer();
  const [busy, setBusy] = React.useState(false);
  const idemKey = React.useRef(newIdempotencyKey());

  React.useEffect(() => {
    let cancelled = false;
    // stage 4 = loaded and in transit; this hub is the destination.
    api.getManifests({ kind: 'dispatch', stage: 4 })
      .then((all) => {
        if (cancelled) return;
        const mine = all.filter((m) => m.destination_hub_code === session.site);
        setManifests(mine);
        if (mine.length === 1) setManifestId(mine[0].id);
      })
      .catch((e) => { if (!cancelled) { setManifests([]); setLoadErr(e.message); } });
    return () => { cancelled = true; };
  }, [api, session.site]);

  const m = manifests && manifests.find((mm) => mm.id === manifestId);
  const expected = m ? (m.assets || []).filter((a) => a.expected).map((a) => a.asset_id) : [];

  function scan(raw) {
    const id = String(raw).trim();
    if (!id) return;
    if (expected.includes(id)) { add(id); return; }
    setUnexpected((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setErr('Unexpected arrival — flagged.');
  }

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      await api.tp5HubIntake(manifestId, scanned, idemKey.current);
      onDone('Hub intake confirmed: ' + manifestId);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  if (manifests === null) {
    return h(Panel, { title: 'TP5 — Hub Intake', onBack }, h('div', { className: 'desc' }, 'Loading…'));
  }

  const pending = expected.filter((id) => !scanned.includes(id));
  const pct = expected.length ? Math.round((expected.length - pending.length) / expected.length * 100) : 0;

  return h(Panel, { title: 'TP5 — Hub Intake', onBack },
    loadErr && h('div', { className: 'alert warn' }, loadErr),
    !m
      ? (manifests.length === 0
        ? h('div', { className: 'empty-note' }, 'No inbound manifests expected here.')
        : h('div', { className: 'tp-pick-list' },
          manifests.map((mm) => h('button', {
            type: 'button', key: mm.id, className: 'tp-pick', onClick: () => setManifestId(mm.id),
          },
            h('div', { className: 'pk-id' }, mm.id),
            h('div', { className: 'pk-sub' }, 'From ' + (mm.origin_dc_code || '—'))
          ))
        ))
      : h(React.Fragment, null,
        h('div', { className: 'desc' }, m.id, ' arriving at ', session.site, '.'),
        h(ScanRow, { onScan: scan }),
        h('div', { className: 'progress-row' },
          h('div', { className: 'progress-bar' }, h('div', { className: 'fill', style: { width: pct + '%' } })),
          h('div', { className: 'progress-label' }, (expected.length - pending.length) + ' / ' + expected.length)
        ),
        h(PillGrid, {
          pills: expected
            .map((id) => ({ id, cls: scanned.includes(id) ? 'scanned' : 'pending' }))
            .concat(unexpected.map((id) => ({ id, cls: 'unexpected' }))),
          emptyNote: 'This manifest has no expected assets.',
        }),
        unexpected.length > 0 && h('div', { className: 'alert info' },
          unexpected.length + ' unexpected arrival(s) — the API will log them as Unexpected Asset exceptions.'),
        pending.length
          ? h('div', { className: 'alert info' }, pending.length + ' pending.')
          : h('div', { className: 'alert ok' }, 'All matched.'),
        err && h('div', { className: 'alert warn' }, err),
        h('div', { className: 'submit-row' },
          h('button', { type: 'button', className: 'btn primary block', disabled: busy, onClick: confirm },
            busy ? 'Confirming…' : 'Confirm hub intake'))
      )
  );
}
