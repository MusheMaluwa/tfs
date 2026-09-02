// scanner/components/ScanInput.js
//
// The scan buffer, extracted once. Every touch point panel does the
// same three things — hold a list of scanned barcodes, reject a
// duplicate, clear the box on Enter — so they all use this instead of
// each keeping its own copy of that logic.

import React from 'react';
const h = React.createElement;

/** Holds the list of barcodes scanned so far in this session. */
export function useScanBuffer() {
  const [scanned, setScanned] = React.useState([]);
  const [err, setErr] = React.useState(null);

  const add = React.useCallback((raw) => {
    const id = String(raw || '').trim();
    if (!id) return false;
    let ok = true;
    setScanned((prev) => {
      if (prev.includes(id)) { ok = false; return prev; }
      return [...prev, id];
    });
    setErr(ok ? null : 'Already scanned.');
    return ok;
  }, []);

  const remove = React.useCallback((id) => setScanned((prev) => prev.filter((x) => x !== id)), []);
  const reset = React.useCallback(() => { setScanned([]); setErr(null); }, []);

  return { scanned, err, setErr, add, remove, reset };
}

/** The barcode entry row. A handheld scanner types the barcode and
 *  sends Enter, which is why Enter — not a button — is the primary
 *  commit path; the button is there for manual keyboard entry. */
export function ScanRow({ onScan, placeholder = 'Scan or type barcode…', autoFocus = true }) {
  const [input, setInput] = React.useState('');

  function commit() {
    if (!input.trim()) return;
    onScan(input);
    setInput('');
  }

  return h('div', { className: 'scan-row' },
    h('input', {
      type: 'text',
      placeholder,
      value: input,
      autoFocus,
      inputMode: 'text',
      autoCapitalize: 'characters',
      autoCorrect: 'off',
      spellCheck: false,
      onChange: (e) => setInput(e.target.value),
      onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } },
    }),
    h('button', { type: 'button', className: 'btn', onClick: commit, disabled: !input.trim() }, 'Add')
  );
}

/** The grid of scanned/expected barcode pills below the input. */
export function PillGrid({ pills, emptyNote = 'No scans yet.' }) {
  if (!pills.length) return h('div', { className: 'empty-note' }, emptyNote);
  return h('div', { className: 'asset-pill-grid' },
    pills.map((p) => h('span', { key: p.id, className: 'apill ' + (p.cls || '') }, p.id))
  );
}
