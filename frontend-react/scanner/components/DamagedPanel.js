// scanner/components/DamagedPanel.js
//
// Damaged Asset Scan-Out — non-linear. Takes an asset out of the
// active fleet for write-off. The note is required reading for whoever
// reviews the Damaged exception this raises, so the barcode is a
// fill-only field: the camera populates it, and nothing is submitted
// until the note has been typed and the button pressed.

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { ScanField, PillGrid } from './ScanInput.js';
import { Panel } from './Panel.js';
const h = React.createElement;

export function DamagedPanel({ api, showToast, onBack }) {
  const [assetId, setAssetId] = React.useState('');
  const [note, setNote] = React.useState('');
  const [log, setLog] = React.useState([]);
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    const id = assetId.trim();
    if (!id) { setErr('Scan or enter a barcode first.'); return; }
    setBusy(true); setErr(null);
    try {
      await api.damagedScanOut(id, note.trim() || 'No note provided', newIdempotencyKey());
      setLog((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setAssetId(''); setNote('');
      showToast(id + ' marked damaged.');
    } catch (e) {
      setErr(e.message);
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return h(Panel, { title: 'Damaged Asset Scan-Out', onBack },
    h('div', { className: 'desc' },
      'Scan a Rolltainer out as damaged/unusable. It\u2019s removed from the active fleet for write-off or scrapping.'),
    h(ScanField, { value: assetId, onChange: setAssetId }),
    h('div', { className: 'field' },
      h('label', null, 'Damage note'),
      h('input', {
        type: 'text', placeholder: 'e.g. Cracked frame, wheel missing',
        value: note, onChange: (e) => setNote(e.target.value),
      })
    ),
    err && h('div', { className: 'alert warn' }, err),
    h('button', { type: 'button', className: 'btn primary block', disabled: busy, onClick: confirm },
      busy ? 'Marking…' : 'Mark damaged & scan out'),
    log.length > 0 && h(React.Fragment, null,
      h('div', { className: 'desc sub-label' }, 'This session:'),
      h(PillGrid, { pills: log.map((id) => ({ id, cls: 'unexpected' })) })
    )
  );
}
