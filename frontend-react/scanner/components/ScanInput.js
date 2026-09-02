// scanner/components/ScanInput.js
//
// The scan buffer and the two barcode-entry rows, extracted once.
// Every touch point panel does the same three things — hold a list of
// scanned barcodes, reject a duplicate, clear the box on Enter — so
// they all use this instead of each keeping its own copy of that
// logic.
//
// Both rows carry a Camera button, matching the vanilla scanner: a
// handheld gun types into the field, a phone uses the camera, and the
// panels above this file don't have to care which.

import React from 'react';
import { BarcodeScanner } from '../../shared/BarcodeScanner.js';
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
 *  commit path; the button is there for manual keyboard entry, and the
 *  camera for a phone. A camera read commits straight away, exactly
 *  like bindScanRow() in frontend/mercury-scanner.html. */
export function ScanRow({ onScan, placeholder = 'Scan or type barcode…', autoFocus = true }) {
  const [input, setInput] = React.useState('');
  const [camera, setCamera] = React.useState(false);

  function commit() {
    if (!input.trim()) return;
    onScan(input);
    setInput('');
  }

  const onResult = React.useCallback((text) => { setCamera(false); onScan(text); }, [onScan]);

  return h(React.Fragment, null,
    h('div', { className: 'scan-row' },
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
      h('button', { type: 'button', className: 'btn', onClick: commit, disabled: !input.trim() }, 'Add'),
      h('button', { type: 'button', className: 'btn', onClick: () => setCamera(true) }, '⌗ Camera')
    ),
    camera && h(BarcodeScanner, { onResult, onClose: () => setCamera(false) })
  );
}

/** Fill-only variant: scanning (camera or typing) just populates the
 *  field, because a second field — a reason, a destination — still
 *  has to be set before a separate confirm button is pressed. Mirrors
 *  bindScanFillOnly() in the vanilla scanner. */
export function ScanField({ value, onChange, placeholder = 'Scan or type barcode…', autoFocus = true }) {
  const [camera, setCamera] = React.useState(false);
  const onResult = React.useCallback((text) => { setCamera(false); onChange(String(text).trim()); }, [onChange]);

  return h(React.Fragment, null,
    h('div', { className: 'scan-row' },
      h('input', {
        type: 'text',
        placeholder,
        value,
        autoFocus,
        inputMode: 'text',
        autoCapitalize: 'characters',
        autoCorrect: 'off',
        spellCheck: false,
        onChange: (e) => onChange(e.target.value),
      }),
      h('button', { type: 'button', className: 'btn', onClick: () => setCamera(true) }, '⌗ Camera')
    ),
    camera && h(BarcodeScanner, { onResult, onClose: () => setCamera(false) })
  );
}

/** The grid of scanned/expected barcode pills below the input. */
export function PillGrid({ pills, emptyNote = 'No scans yet.' }) {
  if (!pills.length) return h('div', { className: 'empty-note' }, emptyNote);
  return h('div', { className: 'asset-pill-grid' },
    pills.map((p) => h('span', { key: p.id, className: 'apill ' + (p.cls || '') }, p.label || p.id))
  );
}
