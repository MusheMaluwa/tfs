// scanner/components/Login.js
//
// Role + site + operator name. The site list is fetched live from
// GET /api/sites (public, precisely so this screen can populate its
// picker before anyone has a token) rather than hardcoded, so a site
// added in the console shows up here without a redeploy.

import React from 'react';
import { ROLES, roleDef } from './constants.js';
const h = React.createElement;

export function Login({ dcSites, hubSites, onLogin, loggingIn, error }) {
  const [role, setRole] = React.useState(null);
  const [site, setSite] = React.useState('');
  const [name, setName] = React.useState('');

  const def = roleDef(role);
  // WSW operators work inside a DC, so they pick from the DC list.
  const siteOptions = role === 'DC' || role === 'WSW' ? dcSites : role === 'Hub' ? hubSites : [];
  const blocked = loggingIn || !role || (def && def.needsSite && !site);

  function submit() {
    if (blocked) return;
    onLogin(role, def && def.needsSite ? site : null, name.trim() || 'Unnamed operator');
  }

  return h('div', { className: 'login-wrap' },
    h('div', { className: 'login-head' },
      h('div', { className: 'mark lg' }, 'TFS'),
      h('h1', null, 'TFS LOGISTICS'),
      h('div', { className: 'login-kicker' }, 'Touch point scanning')
    ),
    h('div', { className: 'panel' },
      h('div', { className: 'field' },
        h('label', null, 'Role'),
        h('div', { className: 'role-grid' },
          ROLES.map((r) => h('button', {
            key: r.id,
            type: 'button',
            className: 'role-card' + (role === r.id ? ' selected' : ''),
            'aria-pressed': role === r.id,
            onClick: () => { setRole(r.id); setSite(''); },
          },
            h('div', { className: 'r-title' }, r.title),
            h('div', { className: 'r-sub' }, r.sub)
          ))
        )
      ),

      def && def.needsSite && h('div', { className: 'field' },
        h('label', null, role === 'Hub' ? 'Hub / vendor site' : 'Distribution Centre'),
        h('select', { value: site, onChange: (e) => setSite(e.target.value) },
          h('option', { value: '' }, '— choose —'),
          siteOptions.map((s) => h('option', { key: s, value: s }, s))
        ),
        siteOptions.length === 0 && h('div', { className: 'empty-note' }, 'No sites loaded — is the API reachable?')
      ),

      h('div', { className: 'field' },
        h('label', null, 'Operator name / ID'),
        h('input', {
          type: 'text', placeholder: 'e.g. T. Nkosi / OP-2214', value: name,
          onChange: (e) => setName(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') submit(); },
        })
      ),

      error && h('div', { className: 'alert warn' }, error),

      h('button', { type: 'button', className: 'btn primary block', disabled: blocked, onClick: submit },
        loggingIn ? 'Logging in…' : 'Log in')
    ),
    h('footer', null, 'BACK-OFFICE REPORTING LIVES IN THE TFS LOGISTICS CONSOLE')
  );
}
