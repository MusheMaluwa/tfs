// scanner/components/TP6Panel.js
//
// TP6 — Hub Empty Collection. Everything currently sitting at this hub
// is listed; scanning stages it onto a new return manifest. Anything
// that has been here a week or more is highlighted, because the
// backend raises an "Aged at Hub" exception for whatever gets left
// behind (stateMachine.tp6HubEmptyCollection).

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { daysSince } from '../../shared/format.js';
import { useScanBuffer, ScanRow, PillGrid } from './ScanInput.js';
import { Panel } from './Panel.js';
import { useFleet } from './useFleet.js';
const h = React.createElement;

const AGED_DAYS = 7;

export function TP6Panel({ api, session, onDone, onBack }) {
  const { assets, error } = useFleet(api);
  const { scanned, err, setErr, add } = useScanBuffer();
  const [busy, setBusy] = React.useState(false);
  const idemKey = React.useRef(newIdempotencyKey());

  const atHub = React.useMemo(
    () => (assets || []).filter((a) => a.status === 'At Hub: ' + session.site && !a.outstanding_reason),
    [assets, session.site]
  );

  function scan(raw) {
    const id = String(raw).trim();
    if (!id) return;
    if (!atHub.some((a) => a.id === id)) { setErr('Not at this hub.'); return; }
    add(id);
  }

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const result = await api.tp6EmptyCollection(scanned, idemKey.current);
      onDone('Return manifest generated: ' + result.returnManifestId);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  if (assets === null) {
    return h(Panel, { title: 'TP6 — Empty Collection', onBack }, h('div', { className: 'desc' }, 'Loading…'));
  }
  if (atHub.length === 0) {
    return h(Panel, { title: 'TP6 — Empty Collection', onBack },
      error && h('div', { className: 'alert warn' }, error),
      h('div', { className: 'empty-note' }, 'No assets at this hub to stage for return.'));
  }

  return h(Panel, { title: 'TP6 — Empty Collection', onBack },
    h('div', { className: 'desc' }, 'Scan each empty asset as you stage it for return.'),
    h(ScanRow, { onScan: scan }),
    h(PillGrid, {
      pills: atHub.map((a) => {
        const age = daysSince(a.hub_arrival_at);
        const aged = a.hub_arrival_at && age >= AGED_DAYS;
        return {
          id: a.id,
          cls: scanned.includes(a.id) ? 'scanned' : (aged ? 'priority' : 'pending'),
          label: aged ? a.id + ' · ' + age + 'd' : a.id,
        };
      }),
      emptyNote: 'Nothing at this hub.',
    }),
    err && h('div', { className: 'alert warn' }, err),
    h('div', { className: 'submit-row' },
      h('button', { type: 'button', className: 'btn primary block', disabled: !scanned.length || busy, onClick: confirm },
        busy ? 'Generating…' : 'Generate return manifest (' + scanned.length + ')'))
  );
}
