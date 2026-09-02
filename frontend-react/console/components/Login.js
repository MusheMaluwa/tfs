// console/components/Login.js
//
// The console needs a token like anything else: every read endpoint
// except GET /api/sites requires auth, and registering assets or sites
// requires the DC role specifically (backend/src/routes/assets.js).
// So this is a deliberately minimal manager sign-in, not the scanner's
// four-role operator picker — a different app with a different job.
//
// SSO SWAP POINT: the backend currently issues a token for any name it
// is given without verifying identity (backend/src/routes/auth.js).
// That gap is the backend's to close; this screen will not need to
// change when it does.

import React from 'react';
const h = React.createElement;

export function Login({ dcSites, onLogin, loggingIn, error }) {
  const [name, setName] = React.useState('');
  const [site, setSite] = React.useState('');

  React.useEffect(() => { if (!site && dcSites.length) setSite(dcSites[0]); }, [dcSites, site]);

  const blocked = loggingIn || !name.trim();
  const submit = () => { if (!blocked) onLogin(name.trim(), site || null); };

  return h('div', { className: 'login-wrap' },
    h('div', { className: 'login-head' },
      h('div', { className: 'mark lg' }, 'TFS'),
      h('h1', null, 'TFS LOGISTICS'),
      h('div', { className: 'login-kicker' }, 'Console — dashboard & asset registry')
    ),
    h('div', { className: 'panel' },
      h('div', { className: 'field' },
        h('label', null, 'Manager name / ID'),
        h('input', {
          type: 'text', value: name, placeholder: 'e.g. R. Mahlangu / MGR-104', autoFocus: true,
          onChange: (e) => setName(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') submit(); },
        })
      ),
      h('div', { className: 'field' },
        h('label', null, 'Home distribution centre'),
        h('select', { value: site, onChange: (e) => setSite(e.target.value) },
          dcSites.length === 0
            ? h('option', { value: '' }, '— none loaded —')
            : dcSites.map((s) => h('option', { key: s, value: s }, s))
        ),
        dcSites.length === 0 && h('div', { className: 'empty-note' }, 'No sites loaded — is the API reachable?')
      ),
      error && h('div', { className: 'alert warn' }, error),
      h('button', { type: 'button', className: 'btn primary block', disabled: blocked, onClick: submit },
        loggingIn ? 'Signing in…' : 'Sign in')
    ),
    h('footer', null, 'SCANNING HAPPENS IN THE TFS LOGISTICS SCANNER APP')
  );
}
