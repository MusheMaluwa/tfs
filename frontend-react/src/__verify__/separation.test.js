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

/** Every module specifier a file imports.
 *
 *  Anchored to lines that actually begin an import/export statement,
 *  not any `from '...'` in the file — a UI string like
 *  `m.id, ' from ', m.origin_dc_code` otherwise reads as an import of
 *  " from ". Every import here is a single line; a multi-line one
 *  would need this widened. */
function importsOf(file) {
  return read(file)
    .split(/\r?\n/)
    .filter((line) => /^\s*(import|export)\s/.test(line))
    .flatMap((line) => [
      ...line.matchAll(/from\s+['"]([^'"]+)['"]/g),
      ...line.matchAll(/^\s*import\s+['"]([^'"]+)['"]/g),
    ].map((m) => m[1]));
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

  // Leaflet is a desktop-console concern. An operator's phone must never
  // download a map library it has no screen for. ZXing is the opposite:
  // the camera IS the scanner's barcode input, so both apps load it.
  assert.doesNotMatch(scanner, /leaflet/i, 'the scanner must not load Leaflet');
  assert.match(scanner, /zxing/i, 'the scanner needs ZXing for the camera scan row');
  assert.match(console_, /leaflet/i);
  assert.match(console_, /zxing/i);
});

test('the scanner namespaces its own storage keys, and the console stores no session at all', () => {
  const scannerApp = read(path.join(ROOT, 'scanner/app.js'));
  const consoleApp = read(path.join(ROOT, 'console/app.js'));

  // The scanner has a real sign-in, so its keys must not collide with
  // anything else on the same origin.
  const scannerKeys = scannerApp.match(/'tfs_scanner_\w+'/g) || [];
  assert.ok(scannerKeys.length >= 2, 'scanner should namespace its own token and session keys');

  // The console has no sign-in — it authenticates itself on load and
  // keeps the token in memory. Persisting one would be the first step
  // back towards a login screen it is not supposed to have.
  // Matched as a call, not a bare word — the file's header comment
  // mentions the old localStorage prototype it replaced.
  assert.doesNotMatch(consoleApp, /\b(session|local)Storage\s*\./,
    'the console must not persist a session — it has no sign-in');
});

test('the console renders without any sign-in step', () => {
  const consoleApp = read(path.join(ROOT, 'console/app.js'));
  const files = CONSOLE_FILES.map(rel);

  assert.ok(!files.includes('console/components/Login.js'),
    'the console should have no Login component — it is open on load, like the vanilla console');
  assert.doesNotMatch(consoleApp, /Sign out|Sign in/,
    'no sign-in or sign-out controls belong in the console header');
  // It still has to obtain a token, because the API requires one on
  // every read endpoint except GET /api/sites.
  assert.match(consoleApp, /\.login\(/, 'the console must still authenticate itself on load');
});
