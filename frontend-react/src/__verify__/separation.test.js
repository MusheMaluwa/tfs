// src/__verify__/separation.test.js
//
// The architecture tests. Everything else here checks that a component
// renders; these check that the two apps stay two apps.
//
// The whole point of the split is that the scanner and the console can
// be changed independently, and that the only thing crossing between
// them is the backend contract. That property is easy to state and
// easy to break by accident — one convenient import from
// ../console/components/ and the separation is gone with nothing to
// notice it. So it is asserted, not just documented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function jsFilesIn(dir) {
  const out = [];
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) out.push(full);
    }
  })(path.join(ROOT, dir));
  return out;
}

const read = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

/** Every `from '...'` specifier in a file. */
function importsOf(file) {
  return [...read(file).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

const SCANNER_FILES = jsFilesIn('scanner');
const CONSOLE_FILES = jsFilesIn('console');
const SHARED_FILES = jsFilesIn('shared');

test('the scanner app never imports from the console app', () => {
  for (const f of SCANNER_FILES) {
    for (const spec of importsOf(f)) {
      assert.ok(!spec.includes('console/'), `${rel(f)} imports "${spec}" — the two apps must stay independent`);
    }
  }
});

test('the console app never imports from the scanner app', () => {
  for (const f of CONSOLE_FILES) {
    for (const spec of importsOf(f)) {
      assert.ok(!spec.includes('scanner/'), `${rel(f)} imports "${spec}" — the two apps must stay independent`);
    }
  }
});

test('shared/ depends on neither app — it is the bottom of the graph', () => {
  for (const f of SHARED_FILES) {
    for (const spec of importsOf(f)) {
      assert.ok(
        !spec.includes('scanner/') && !spec.includes('console/'),
        `${rel(f)} imports "${spec}" — shared code must not reach back into an app`
      );
    }
  }
});

test('each app has exactly one React root, so neither can grow a second entry point by accident', () => {
  const roots = (files) => files.filter((f) => /createRoot\s*\(/.test(read(f)));
  assert.deepEqual(roots(SCANNER_FILES).map(rel), ['scanner/app.js']);
  assert.deepEqual(roots(CONSOLE_FILES).map(rel), ['console/app.js']);
});

test('the backend contract lives in exactly one file', () => {
  // A second createApi, or a stray fetch() to /api/, means one app has
  // started talking to the backend on its own terms.
  const offenders = [...SCANNER_FILES, ...CONSOLE_FILES]
    .filter((f) => /fetch\s*\(/.test(read(f)) || /function\s+createApi/.test(read(f)))
    .map(rel);
  assert.deepEqual(offenders, [], 'these files call the API directly instead of going through shared/api.js');
});

test('every relative import resolves to a file that exists', () => {
  for (const f of [...SCANNER_FILES, ...CONSOLE_FILES, ...SHARED_FILES]) {
    for (const spec of importsOf(f)) {
      if (!spec.startsWith('.')) continue;
      const target = path.resolve(path.dirname(f), spec);
      assert.ok(fs.existsSync(target), `${rel(f)} imports "${spec}", which does not exist`);
    }
  }
});

test("every bare import is declared in its own app's import map", () => {
  // With no bundler, an import the import map does not name is a blank
  // page in the browser and nothing at all in these tests — this is the
  // only place that mismatch gets caught.
  for (const [app, files] of [['scanner', SCANNER_FILES], ['console', CONSOLE_FILES]]) {
    const html = read(path.join(ROOT, app, 'index.html'));
    const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;

    const appAndShared = [...files, ...SHARED_FILES];
    for (const f of appAndShared) {
      for (const spec of importsOf(f)) {
        if (spec.startsWith('.')) continue;
        assert.ok(map[spec], `${rel(f)} imports "${spec}", which ${app}/index.html's import map does not declare`);
      }
    }
  }
});

test('both apps pin the same React version, so shared components behave identically in each', () => {
  const mapFor = (app) => JSON.parse(
    read(path.join(ROOT, app, 'index.html')).match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]
  ).imports;
  assert.deepEqual(mapFor('scanner'), mapFor('console'));
});

test('each app loads the shared palette plus its own stylesheet, and no third-party CSS leaks between them', () => {
  const scanner = read(path.join(ROOT, 'scanner/index.html'));
  const console_ = read(path.join(ROOT, 'console/index.html'));

  for (const [name, html, own] of [['scanner', scanner, 'scanner.css'], ['console', console_, 'console.css']]) {
    assert.match(html, /shared\/tokens\.css/, `${name} should load the shared palette`);
    assert.match(html, new RegExp(own.replace('.', '\\.')), `${name} should load its own stylesheet`);
  }

  // Leaflet and ZXing are desktop-console concerns. An operator's phone
  // must never download a map library it has no screen for.
  assert.doesNotMatch(scanner, /leaflet/i, 'the scanner must not load Leaflet');
  assert.doesNotMatch(scanner, /zxing/i, 'the scanner must not load ZXing');
  assert.match(console_, /leaflet/i);
});

test('the two apps use different sessionStorage keys, so signing out of one does not sign out of the other', () => {
  const keysIn = (file) => [...read(path.join(ROOT, file)).matchAll(/sessionStorage\.\w+\(([^,)]+)/g)].map((m) => m[1].trim());
  const scannerKeys = read(path.join(ROOT, 'scanner/app.js')).match(/'tfs_scanner_\w+'/g) || [];
  const consoleKeys = read(path.join(ROOT, 'console/app.js')).match(/'tfs_console_\w+'/g) || [];
  assert.ok(scannerKeys.length >= 2, 'scanner should namespace its own token and session keys');
  assert.ok(consoleKeys.length >= 2, 'console should namespace its own token and session keys');
  // Neither app should reference the other's constants at all.
  assert.equal(keysIn('scanner/app.js').filter((k) => k.includes('console')).length, 0);
  assert.equal(keysIn('console/app.js').filter((k) => k.includes('scanner')).length, 0);
});
