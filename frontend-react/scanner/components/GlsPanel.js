// scanner/components/GlsPanel.js
//
// GLS Vendor Custody — non-linear. Hands an asset to a third-party GLS
// site and takes it back later. The GLS sites come from GET /api/sites
// (type 'GLS') rather than a hardcoded pair, so onboarding a third
// vendor in the console is enough.

import React from 'react';
import { newIdempotencyKey } from '../../shared/api.js';
import { ScanRow, ScanField, PillGrid } from './ScanInput.js';
import { Panel, SubHead } from './Panel.js';
import { useFleet } from './useFleet.js';
const h = React.createElement;

export function GlsPanel({ api, glsSites, showToast, onBack }) {
  const { assets, error, reload } = useFleet(api);
  const [outId, setOutId] = React.useState('');
  const [site, setSite] = React.useState('');
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (!site && glsSites.length) setSite(glsSites[0]); }, [glsSites, site]);

  const withGls = (assets || []).filter((a) => (a.status || '').startsWith('With GLS Vendor'));

  async function scanOut() {
    const id = outId.trim();
    if (!id) { setErr('Scan or enter a barcode first.'); return; }
    if (!site) { setErr('No GLS site to transfer to.'); return; }
    setBusy(true); setErr(null);
    try {
      await api.glsOut(id, site, newIdempotencyKey());
      setOutId('');
      showToast(id + ' transferred to ' + site + '.');
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
      await api.glsIn(id, newIdempotencyKey());
      showToast(id + ' returned from GLS custody.');
      reload();
    } catch (e) {
      setErr(e.message);
      showToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return h(Panel, { title: 'GLS Vendor Custody', onBack },
    h('div', { className: 'desc' }, 'Scan a Rolltainer out to a GLS site, or scan one back in when it\u2019s returned.'),
    error && h('div', { className: 'alert warn' }, error),

    h(SubHead, null, 'Transfer out to GLS'),
    h(ScanField, { value: outId, onChange: setOutId }),
    h('div', { className: 'field' },
      h('label', null, 'GLS site'),
      h('select', { value: site, onChange: (e) => setSite(e.target.value) },
        glsSites.map((s) => h('option', { key: s, value: s }, s))),
      glsSites.length === 0 && h('div', { className: 'empty-note' }, 'No GLS sites registered.')
    ),
    h('button', { type: 'button', className: 'btn primary block', disabled: busy || !site, onClick: scanOut },
      'Transfer to GLS custody'),

    h(SubHead, null, 'Currently with GLS'),
    assets === null
      ? h('div', { className: 'empty-note' }, 'Loading…')
      : h(PillGrid, {
        pills: withGls.map((a) => ({
          id: a.id, cls: 'pending', label: a.id + ' — ' + a.status.replace('With GLS Vendor: ', ''),
        })),
        emptyNote: 'None.',
      }),
    h(ScanRow, { onScan: scanIn, autoFocus: false, placeholder: 'Scan an asset back in from GLS…' }),
    err && h('div', { className: 'alert warn' }, err)
  );
}
