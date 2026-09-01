// components.js
//
// Real React components (hooks, composition, the works) — written with
// React.createElement instead of JSX. That's a deliberate choice, not
// a limitation papered over: React 19 removed UMD/CDN builds in favour
// of ES modules (see react.dev's 2024 upgrade guide), and this repo has
// no bundler available to compile JSX, so shipping plain
// React.createElement calls is what actually runs in a browser with
// zero build step — exactly the "self-contained file, no install"
// property the original vanilla app had. `h` below is a short alias
// for React.createElement, the standard way to keep this readable
// without JSX.
//
// This file is loaded two ways:
//   1. In the browser, as an ES module (see index.html).
//   2. In Node, by src/__verify__/render.test.js, using the *real*
//      react-dom/server package to actually render these components
//      and assert on the output — not a visual "looks right" check,
//      a real one.
// Both paths run the identical code; nothing is mocked for the test.

export function makeComponents(React) {
  const { useState, useEffect, useCallback } = React;
  const h = React.createElement;

  const ROLES = [
    { id: 'DC', title: 'DC Operator', sub: 'Dispatch Open / Close · Return Receipt', needsSite: true },
    { id: 'TDT', title: 'TDT Driver', sub: 'Vehicle Intake · Loaded Confirm', needsSite: false },
    { id: 'Hub', title: 'Hub Operator', sub: 'Hub Intake · Empty Collection', needsSite: true },
    { id: 'WSW', title: 'WSW Operator', sub: 'Wrong Source Warehouse — Intake & Sort', needsSite: true },
  ];

  const TP_META = [
    { seq: 1, id: 'tp1', title: 'DC Dispatch Open', role: 'DC', location: 'Distribution Centre' },
    { seq: 2, id: 'tp2', title: 'DC Dispatch Close', role: 'DC', location: 'Distribution Centre' },
    { seq: 3, id: 'tp3', title: 'TDT Dispatch Intake', role: 'TDT', location: 'TDT Vehicle' },
    { seq: 4, id: 'tp4', title: 'TDT Dispatch Loaded', role: 'TDT', location: 'TDT Vehicle' },
    { seq: 5, id: 'tp5', title: 'Hub Intake', role: 'Hub', location: 'Hub / Vendor Site' },
    { seq: 6, id: 'tp6', title: 'Hub Empty Collection', role: 'Hub', location: 'Hub / Vendor Site' },
    { seq: 7, id: 'tp7', title: 'DC Return Receipt', role: 'DC', location: 'Distribution Centre' },
  ];

  /* ---------------- Login ---------------- */
  function Login({ dcSites, hubSites, onLogin, loggingIn, error }) {
    const [role, setRole] = useState(null);
    const [site, setSite] = useState('');
    const [name, setName] = useState('');
    const roleDef = ROLES.find(r => r.id === role);
    const siteOptions = role === 'DC' || role === 'WSW' ? dcSites : role === 'Hub' ? hubSites : [];

    return h('div', { className: 'login-wrap' },
      h('div', { style: { textAlign: 'center', marginBottom: 20 } },
        h('div', { className: 'mark', style: { display: 'inline-flex', width: 'auto', minWidth: 52, height: 44, padding: '0 14px', borderRadius: 9, background: 'linear-gradient(135deg,var(--amber),var(--cyan))', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, color: '#FFF', fontSize: 15, marginBottom: 10 } }, 'TFS'),
        h('h1', { style: { fontFamily: 'var(--font-display)', fontSize: 22, margin: 0 } }, 'TFS LOGISTICS'),
        h('div', { style: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 4 } }, 'Touch point scanning (React build)')
      ),
      h('div', { className: 'panel' },
        h('div', { className: 'field' },
          h('label', null, 'Role'),
          h('div', { className: 'role-grid' },
            ROLES.map(r => h('div', {
              key: r.id,
              className: 'role-card' + (role === r.id ? ' selected' : ''),
              onClick: () => { setRole(r.id); setSite(''); },
            },
              h('div', { className: 'r-title' }, r.title),
              h('div', { className: 'r-sub' }, r.sub)
            ))
          )
        ),
        roleDef && roleDef.needsSite && h('div', { className: 'field' },
          h('label', null, roleDef.id === 'DC' || roleDef.id === 'WSW' ? 'Distribution Centre' : 'Hub / vendor site'),
          h('select', { value: site, onChange: e => setSite(e.target.value) },
            h('option', { value: '' }, '— choose —'),
            siteOptions.map(s => h('option', { key: s, value: s }, s))
          )
        ),
        h('div', { className: 'field' },
          h('label', null, 'Operator name / ID'),
          h('input', { type: 'text', placeholder: 'e.g. T. Nkosi / OP-2214', value: name, onChange: e => setName(e.target.value) })
        ),
        error && h('div', { className: 'alert warn' }, error),
        h('button', {
          className: 'btn primary block',
          disabled: loggingIn || !role || (roleDef && roleDef.needsSite && !site),
          onClick: () => onLogin(role, roleDef && roleDef.needsSite ? site : null, name.trim() || 'Unnamed operator'),
        }, loggingIn ? 'Logging in…' : 'Log in')
      )
    );
  }

  /* ---------------- Picker ---------------- */
  function Picker({ session, onSelect, onLogout }) {
    const roleDef = ROLES.find(r => r.id === session.role);
    const myTPs = TP_META.filter(tp => tp.role === session.role);
    return h(React.Fragment, null,
      h('header', { className: 'top' },
        h('div', { className: 'brand' }, h('div', { className: 'mark' }, 'TFS'), h('h1', null, 'TFS LOGISTICS')),
        h('div', { className: 'session-tag' },
          h('span', null, h('b', null, roleDef.title), session.site ? ' · ' + session.site : ''),
          h('button', { onClick: onLogout }, 'Switch')
        )
      ),
      h('div', { className: 'panel' },
        h('h2', null, 'Your touch points'),
        h('div', { className: 'desc' }, session.opName, ' — tap a step to scan.'),
        h('div', { className: 'tp-list' },
          myTPs.map(tp => h('button', { type: 'button', key: tp.id, className: 'tp-card', onClick: () => onSelect(tp.id) },
            h('div', null,
              h('div', { className: 'tp-num' }, 'TP' + tp.seq),
              h('div', { className: 'tp-title' }, tp.title),
              h('div', { className: 'tp-loc' }, tp.location)
            ),
            h('div', { className: 'arrow' }, '→')
          ))
        )
      ),
      h('footer', null, 'TFS LOGISTICS — REACT BUILD, LIVE API')
    );
  }

  /* ---------------- TP1 ---------------- */
  function TP1Panel({ api, session, onDone, onBack }) {
    const [scanned, setScanned] = useState([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    function addScan() {
      const id = input.trim();
      if (!id) return;
      if (scanned.includes(id)) { setErr('Already scanned.'); return; }
      setScanned(s => [...s, id]);
      setInput('');
      setErr(null);
    }

    async function confirm() {
      setBusy(true); setErr(null);
      try {
        const result = await api.tp1Open(session.site, scanned);
        onDone('Dispatch opened: ' + result.manifestId);
      } catch (e) {
        setErr(e.message); setBusy(false);
      }
    }

    return h('div', null,
      h('button', { type: 'button', className: 'back-link', onClick: onBack }, '‹ Touch points'),
      h('div', { className: 'panel' },
        h('h2', null, 'TP1 — Dispatch Open'),
        h('div', { className: 'desc' }, 'Scan each asset as you load it for dispatch.'),
        h('div', { className: 'scan-row' },
          h('input', { type: 'text', placeholder: 'Scan or type barcode…', value: input, autoFocus: true,
            onChange: e => setInput(e.target.value), onKeyDown: e => { if (e.key === 'Enter') addScan(); } })
        ),
        h('div', { className: 'asset-pill-grid' },
          scanned.length ? scanned.map(id => h('span', { key: id, className: 'apill scanned' }, id)) : h('span', { className: 'empty-note' }, 'No scans yet.')
        ),
        err && h('div', { className: 'alert warn' }, err),
        h('div', { style: { marginTop: 14 } },
          h('button', { className: 'btn primary', disabled: !scanned.length || busy, onClick: confirm }, `Open dispatch (${scanned.length})`)
        )
      )
    );
  }

  /* ---------------- TP2 ---------------- */
  function TP2Panel({ api, session, hubSites, onDone, onBack }) {
    const [manifests, setManifests] = useState(null);
    const [manifestId, setManifestId] = useState(null);
    const [hub, setHub] = useState(hubSites[0] || '');
    const [scanned, setScanned] = useState([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
      api.getManifests({ kind: 'dispatch', stage: '1' }).then(all => {
        const mine = all.filter(m => m.origin_dc_code === session.site);
        setManifests(mine);
        if (mine.length === 1) setManifestId(mine[0].id);
      });
    }, []);

    function addScan() {
      const id = input.trim();
      if (!id) return;
      if (scanned.includes(id)) { setErr('Already scanned.'); return; }
      setScanned(s => [...s, id]); setInput(''); setErr(null);
    }

    async function confirm() {
      setBusy(true); setErr(null);
      try {
        const result = await api.tp2Close(manifestId, hub, scanned);
        onDone('Closed & locked: ' + manifestId + (result.missing.length ? ` (${result.missing.length} missing, flagged outstanding)` : ''));
      } catch (e) { setErr(e.message); setBusy(false); }
    }

    if (manifests === null) return h('div', { className: 'panel' }, h('h2', null, 'TP2 — Dispatch Close'), h('div', { className: 'desc' }, 'Loading…'));

    const m = manifests.find(mm => mm.id === manifestId);
    return h('div', null,
      h('button', { type: 'button', className: 'back-link', onClick: onBack }, '‹ Touch points'),
      h('div', { className: 'panel' },
        h('h2', null, 'TP2 — Dispatch Close'),
        !manifestId
          ? (manifests.length === 0
            ? h('div', { className: 'empty-note' }, 'No open dispatch waiting to be closed.')
            : h('div', { className: 'tp-pick-list' }, manifests.map(mm => h('button', { type: 'button', key: mm.id, className: 'tp-pick', onClick: () => setManifestId(mm.id) },
                h('div', { className: 'pk-id' }, mm.id), h('div', { className: 'pk-sub' }, (mm.assets || []).filter(a => a.expected).length + ' assets')))))
          : h(React.Fragment, null,
              h('div', { className: 'desc' }, m.id, ' · confirm everything is loaded onto the TDT vehicle.'),
              h('div', { className: 'field' }, h('label', null, 'Destination hub'),
                h('select', { value: hub, onChange: e => setHub(e.target.value) }, hubSites.map(hs => h('option', { key: hs, value: hs }, hs)))),
              h('div', { className: 'scan-row' },
                h('input', { type: 'text', placeholder: 'Scan or type barcode…', value: input, autoFocus: true,
                  onChange: e => setInput(e.target.value), onKeyDown: e => { if (e.key === 'Enter') addScan(); } })),
              h('div', { className: 'asset-pill-grid' },
                (m.assets || []).filter(a => a.expected).map(a => h('span', { key: a.asset_id, className: 'apill ' + (scanned.includes(a.asset_id) ? 'scanned' : 'pending') }, a.asset_id))),
              err && h('div', { className: 'alert warn' }, err),
              h('div', { style: { marginTop: 14 } }, h('button', { className: 'btn primary block', disabled: busy, onClick: confirm }, 'Close & lock'))
            )
      )
    );
  }

  return { ROLES, TP_META, Login, Picker, TP1Panel, TP2Panel };
}
