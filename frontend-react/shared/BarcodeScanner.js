// shared/BarcodeScanner.js
//
// Camera barcode capture. Both apps need the identical thing — the
// console for "Register a new asset", the scanner behind the Camera
// button on every scan row — and a camera that is not torn down
// correctly leaks the same way in either, so it lives here rather
// than being copied twice. It is the second genuinely shared UI
// component, alongside Toast.
//
// Same hosting pattern as SiteMap: ZXing 0.21 ships UMD, so each
// index.html loads it with a <script> tag and this component reads
// window.ZXing. It hands the <video> element to the library and stops
// every track on unmount — a camera left streaming is the classic
// leak here.

import React from 'react';
const h = React.createElement;

function supported() {
  return typeof window !== 'undefined'
    && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    && typeof window.ZXing !== 'undefined';
}

/** getUserMedia is only granted on a secure origin. Saying so up front
 *  beats an opaque permission failure. */
function secureContext() {
  if (typeof location === 'undefined') return false;
  return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

export function BarcodeScanner({ onResult, onClose }) {
  const videoRef = React.useRef(null);
  const readerRef = React.useRef(null);
  const [status, setStatus] = React.useState('Requesting camera access…');
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    function stop() {
      if (readerRef.current) {
        try { readerRef.current.reset(); } catch { /* already torn down */ }
        readerRef.current = null;
      }
      const v = videoRef.current;
      if (v && v.srcObject) {
        v.srcObject.getTracks().forEach((t) => t.stop());
        v.srcObject = null;
      }
    }

    async function start() {
      if (!supported()) { setFailed(true); setStatus("Camera scanning isn't available in this browser."); return; }
      if (!secureContext()) { setFailed(true); setStatus('Camera access needs HTTPS (or localhost).'); return; }

      const ZXing = window.ZXing;
      try {
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.ITF,
          ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.QR_CODE,
          ZXing.BarcodeFormat.DATA_MATRIX,
        ]);
        const reader = new ZXing.BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
        if (cancelled) return;
        const backCam = devices.find((d) => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];
        setStatus('Looking for a barcode…');

        reader.decodeFromVideoDevice(backCam ? backCam.deviceId : undefined, videoRef.current, (result) => {
          if (!result || cancelled) return;
          const text = result.getText();
          setStatus('Got it: ' + text);
          cancelled = true;
          stop();
          onResult(text);
        });
      } catch (err) {
        if (cancelled) return;
        setFailed(true);
        if (err && err.name === 'NotAllowedError') setStatus('Camera permission denied.');
        else if (err && err.name === 'NotFoundError') setStatus('No camera found.');
        else setStatus("Couldn't start the camera.");
      }
    }

    start();
    return () => { cancelled = true; stop(); };
  }, [onResult]);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return h('div', {
    className: 'modal-overlay open scan-overlay',
    onClick: (e) => { if (e.target === e.currentTarget) onClose(); },
    role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Scan barcode',
  },
    h('div', { className: 'modal-box scan-box' },
      h('h3', { className: 'flush' }, 'Scan barcode'),
      h('div', { className: 'mb-sub' }, 'Point the camera at the asset barcode.'),
      h('div', { className: 'scan-video-frame' },
        h('video', { ref: videoRef, muted: true, playsInline: true })),
      h('div', { className: 'scan-status' + (failed ? ' err' : '') }, status),
      h('div', { className: 'scan-actions' },
        h('button', { type: 'button', className: 'btn sm', onClick: onClose }, 'Cancel'))
    )
  );
}
