// console/components/AssetModal.js
//
// Full chain of custody for one asset. The scan history comes from
// GET /api/assets/:id, which joins the append-only custody_log — so
// this is the audit trail, fetched fresh each time it is opened rather
// than read from whatever the table happened to be holding.

import React from 'react';
import { fmtTs, daysSince, statusChipClass } from '../../shared/format.js';
const h = React.createElement;

function Detail({ k, v }) {
  return h('div', { className: 'detail-item' },
    h('div', { className: 'k' }, k),
    h('div', { className: 'v' }, v));
}

export function AssetModal({ api, assetId, onClose }) {
  const [asset, setAsset] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    setAsset(null); setErr(null);
    api.getAsset(assetId)
      .then((a) => { if (!cancelled) setAsset(a); })
      .catch((e) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [api, assetId]);

  // Escape closes, like every other modal the operator has ever used.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const outstanding = asset && asset.outstanding_reason;
  const log = asset && asset.custodyLog ? asset.custodyLog : [];

  return h('div', {
    className: 'modal-overlay open',
    onClick: (e) => { if (e.target === e.currentTarget) onClose(); },
    role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Asset ' + assetId,
  },
    h('div', { className: 'modal-box' },
      h('button', { type: 'button', className: 'mb-close', onClick: onClose, 'aria-label': 'Close' }, '×'),
      h('h2', null, assetId),

      err && h('div', { className: 'alert warn' }, err),
      !asset && !err && h('div', { className: 'empty-note' }, 'Loading…'),

      asset && h(React.Fragment, null,
        h('div', { className: 'mb-sub' }, asset.type + ' · registered ' + fmtTs(asset.registered_at)),
        h('div', { className: 'mb-chip' },
          h('span', { className: 'chip ' + (outstanding ? 'c-outstanding' : statusChipClass(asset.status)) },
            h('span', { className: 'dot' }),
            outstanding ? 'Outstanding' : asset.status)),

        h('div', { className: 'detail-grid' },
          h(Detail, { k: 'Home site', v: asset.home_site_code }),
          asset.manifest_id && h(Detail, { k: 'Active manifest', v: asset.manifest_id }),
          asset.hub_arrival_at && h(Detail, { k: 'Hub arrival', v: fmtTs(asset.hub_arrival_at) }),
          asset.transfer_to_code && h(Detail, { k: 'Transferring to', v: asset.transfer_to_code }),
          outstanding && h(Detail, { k: 'Outstanding reason', v: asset.outstanding_reason }),
          outstanding && asset.outstanding_since && h(Detail, {
            k: 'Outstanding since',
            v: fmtTs(asset.outstanding_since) + ' (' + daysSince(asset.outstanding_since) + 'd)',
          })
        ),

        h('h3', { className: 'flush' }, 'Scan history'),
        log.length === 0
          ? h('div', { className: 'empty-note' }, 'No scan events logged yet.')
          : h('div', { className: 'timeline' },
              // The API returns newest first, which is the order we want.
              log.map((ev, i) => h('div', { className: 'ev', key: i },
                h('div', { className: 'ts' }, fmtTs(ev.ts)),
                h('div', { className: 'dotcol' }, h('span')),
                h('div', { className: 'body' },
                  ev.note,
                  ev.operator && h('div', { className: 'op' }, ev.operator))
              ))
            )
      )
    )
  );
}
