// scanner/components/TP4Panel.js
//
// TP4 — TDT Dispatch Loaded. The last check before the vehicle leaves.
// Nothing is scanned here: anything TP2/TP3 already flagged as
// outstanding needs a reason code, and the backend refuses the whole
// submit until every one of them has one (stateMachine.tp4TdtLoaded).
// Confirming generates the ePOD.

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { PillGrid } from './ScanInput.js';
import { Panel } from './Panel.js';
const h = React.createElement;

// The same four codes the vanilla scanner offers.
const REASONS = ['Damaged', 'Left behind', 'Wrong manifest', 'Other'];

export function TP4Panel({ api, onDone, onBack }) {
  const [manifests, setManifests] = React.useState(null);
  const [loadErr, setLoadErr] = React.useState(null);
  const [manifestId, setManifestId] = React.useState(null);
  // asset_id -> the asset row, so this panel knows which are still
  // outstanding. There is no bulk-by-manifest read, and a manifest is
  // small, so each expected asset is fetched individually.
  const [assets, setAssets] = React.useState(null);
  const [reasons, setReasons] = React.useState({});
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const idemKey = React.useRef(newIdempotencyKey());

  React.useEffect(() => {
    let cancelled = false;
    // stage 3 = intake confirmed at TP3, not yet departed.
    api.getManifests({ kind: 'dispatch', stage: 3 })
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
  const expectedKey = expected.join(',');

  React.useEffect(() => {
    if (!expectedKey) { setAssets(null); return undefined; }
    let cancelled = false;
    setAssets(null);
    Promise.all(expectedKey.split(',').map((id) => api.getAsset(id)))
      .then((rows) => { if (!cancelled) setAssets(Object.fromEntries(rows.map((r) => [r.id, r]))); })
      .catch((e) => { if (!cancelled) { setAssets({}); setErr(e.message); } });
    return () => { cancelled = true; };
  }, [api, expectedKey]);

  const outstanding = expected.filter((id) => assets && assets[id] && assets[id].outstanding_reason);
  const unreasoned = outstanding.filter((id) => !reasons[id]);

  async function confirm() {
    if (unreasoned.length) { setErr('Assign a reason to every missing asset.'); return; }
    setBusy(true); setErr(null);
    try {
      const result = await api.tp4Loaded(manifestId, reasons, idemKey.current);
      onDone('Loaded. ' + result.ePodId + ' generated.');
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  if (manifests === null) {
    return h(Panel, { title: 'TP4 — Dispatch Loaded', onBack }, h('div', { className: 'desc' }, 'Loading…'));
  }

  return h(Panel, { title: 'TP4 — Dispatch Loaded', onBack },
    loadErr && h('div', { className: 'alert warn' }, loadErr),
    !m
      ? (manifests.length === 0
        ? h('div', { className: 'empty-note' }, 'Nothing ready for final confirmation.')
        : h('div', { className: 'tp-pick-list' },
          manifests.map((mm) => h('button', {
            type: 'button', key: mm.id, className: 'tp-pick', onClick: () => { setManifestId(mm.id); setReasons({}); },
          },
            h('div', { className: 'pk-id' }, mm.id),
            h('div', { className: 'pk-sub' }, (mm.assets || []).filter((a) => a.expected).length + ' assets')
          ))
        ))
      : assets === null
        ? h('div', { className: 'desc' }, 'Checking asset states…')
        : h(React.Fragment, null,
          h('div', { className: 'desc' }, m.id, ' · final check before departure.'),
          h(PillGrid, {
            pills: expected.map((id) => {
              const isOut = assets[id] && assets[id].outstanding_reason;
              const cls = reasons[id] ? 'unexpected' : (isOut ? 'pending' : 'scanned');
              return { id, cls, label: reasons[id] ? id + ' — ' + reasons[id] : id };
            }),
            emptyNote: 'This manifest has no expected assets.',
          }),
          outstanding.length
            ? h(React.Fragment, null,
              h('div', { className: 'alert warn' }, unreasoned.length
                ? unreasoned.length + ' missing — pick a reason to proceed.'
                : 'All missing assets have a reason.'),
              h('div', { className: 'reason-list' },
                outstanding.map((id) => h('select', {
                  key: id,
                  value: reasons[id] || '',
                  'aria-label': 'Reason for ' + id,
                  onChange: (e) => setReasons((prev) => ({ ...prev, [id]: e.target.value })),
                },
                  h('option', { value: '' }, id + ' — reason…'),
                  REASONS.map((r) => h('option', { key: r, value: r }, r))
                ))
              )
            )
            : h('div', { className: 'alert ok' }, 'All accounted for.'),
          err && h('div', { className: 'alert warn' }, err),
          h('div', { className: 'submit-row' },
            h('button', { type: 'button', className: 'btn primary block', disabled: busy, onClick: confirm },
              busy ? 'Confirming…' : 'Confirm load'))
        )
  );
}
