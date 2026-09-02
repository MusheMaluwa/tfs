// shared/Toast.js
//
// The one UI component both apps genuinely share: a transient
// bottom-of-screen confirmation. Identical markup, identical CSS (see
// tokens.css), so it lives here rather than being copied twice.
//
// Written with React.createElement rather than JSX because these apps
// run with no build step — see README.md for why.

import React from 'react';
const h = React.createElement;

export function Toast({ toast }) {
  if (!toast) return null;
  return h('div', { className: 'toast show' + (toast.isErr ? ' err' : ''), role: 'status' }, toast.msg);
}

/** The state + timer half of a toast, so neither app re-implements it.
 *  Returns [toast, showToast]; showToast(msg, isErr) auto-clears. */
export function useToast(ms = 3000) {
  const [toast, setToast] = React.useState(null);
  const timer = React.useRef(null);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const showToast = React.useCallback((msg, isErr = false) => {
    clearTimeout(timer.current);
    setToast({ msg, isErr });
    timer.current = setTimeout(() => setToast(null), ms);
  }, [ms]);

  return [toast, showToast];
}
