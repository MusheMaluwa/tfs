// scanner/components/useFleet.js
//
// Several flows key off "which assets are currently in state X at my
// site" — at this hub, at this WSW, in maintenance, with GLS, inbound
// on an inter-DC transfer. The API has no status filter (see
// backend/src/routes/assets.js: type / site / search only), so the
// list is fetched once and filtered here.
//
// `reload` is what a panel calls after a successful scan, because a
// scan is exactly what changes the answer.

import React from 'react';

export function useFleet(api) {
  const [assets, setAssets] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    api.getAssets()
      .then((rows) => { if (!cancelled) { setAssets(rows); setError(null); } })
      .catch((e) => { if (!cancelled) { setAssets([]); setError(e.message); } });
    return () => { cancelled = true; };
  }, [api, nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);
  return { assets, error, reload };
}
