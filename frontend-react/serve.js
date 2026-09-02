// serve.js — a static file server for local development.
//
// Why this exists: ES modules and import maps do not work over
// file:// (the browser blocks module loading from that origin), so
// double-clicking scanner/index.html shows a blank page. This serves
// the folder over http://localhost so both apps run exactly as they
// will when deployed.
//
// Node built-ins only, matching the backend's zero-dependency choice.
// In production these are plain static files — hand the folder to any
// static host (see DEPLOYMENT.md).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(ROOT, url);

  // Contain every request to this folder — a path with ../ in it must
  // not be able to read the rest of the disk.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + url);
    return;
  }

  res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`[frontend-react] http://localhost:${PORT}/`);
  console.log(`  scanner  → http://localhost:${PORT}/scanner/`);
  console.log(`  console  → http://localhost:${PORT}/console/`);
  console.log('  (start the API separately: cd ../backend && npm run dev)');
});
