// src/lib/httpApp.js
//
// A small subset of Express's API (app.use/get/post/delete, req.params/
// query/body, res.status().json()), implemented on node:http only.
// Route handler code written against this reads identically to Express
// route code — the goal is that adopting real Express later (per the
// Development Stack / Decision Record) means swapping this file for
// `require('express')` and keeping every route file unchanged.
//
// This is intentionally not a general-purpose framework — no wildcard
// routes, no route-level regex beyond `:param` segments, no streaming
// bodies. It covers exactly what this API needs.

const http = require('node:http');
const { URL } = require('node:url');

function pathToMatcher(routePath) {
  const paramNames = [];
  const pattern = routePath
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${pattern}$`), paramNames };
}

class Router {
  constructor() {
    this.stack = []; // { method, matcher, handlers } | { middleware }
  }
  use(pathOrMw, maybeMw) {
    if (typeof pathOrMw === 'function') {
      this.stack.push({ middleware: pathOrMw, prefix: '' });
    } else {
      this.stack.push({ middleware: maybeMw, prefix: pathOrMw, isRouter: maybeMw instanceof Router });
    }
  }
  _add(method, routePath, handlers) {
    this.stack.push({ method, matcher: pathToMatcher(routePath), handlers });
  }
  get(p, ...h) { this._add('GET', p, h); }
  post(p, ...h) { this._add('POST', p, h); }
  delete(p, ...h) { this._add('DELETE', p, h); }
  put(p, ...h) { this._add('PUT', p, h); }

  async handle(req, res, basePath = '') {
    const fullPath = req._pathname.startsWith(basePath) ? req._pathname.slice(basePath.length) || '/' : req._pathname;
    for (const layer of this.stack) {
      if (layer.middleware && !layer.method) {
        if (layer.isRouter) {
          if (fullPath.startsWith(layer.prefix)) {
            const handled = await layer.middleware.handle(req, res, layer.prefix);
            if (handled) return true;
          }
          continue;
        }
        let shortCircuited = false;
        await new Promise((resolve) => {
          layer.middleware(req, res, (err) => {
            if (err) { shortCircuited = true; res._error = err; }
            resolve();
          });
        });
        if (res.writableEnded) return true;
        if (shortCircuited) { this._sendError(res, res._error); return true; }
        continue;
      }
      if (layer.method !== req.method) continue;
      const m = layer.matcher.regex.exec(fullPath);
      if (!m) continue;
      req.params = {};
      layer.matcher.paramNames.forEach((name, i) => { req.params[name] = decodeURIComponent(m[i + 1]); });
      try {
        for (const handler of layer.handlers) {
          let nextCalled = false;
          let nextErr = null;
          await handler(req, res, (err) => { nextCalled = true; nextErr = err; });
          if (res.writableEnded) return true;
          if (nextErr) throw nextErr;
          if (!nextCalled) break;
        }
      } catch (err) {
        this._sendError(res, err);
      }
      return true;
    }
    return false;
  }
  _sendError(res, err) {
    if (res.writableEnded) return;
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
}

function createApp() {
  const root = new Router();

  function decorateResponse(res) {
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => {
      const body = JSON.stringify(obj);
      res.setHeader('Content-Type', 'application/json');
      res.end(body);
    };
    return res;
  }

  const server = http.createServer(async (req, res) => {
    decorateResponse(res);

    // Minimal CORS support (no `cors` package dependency) — allows the
    // frontend, served from a different origin, to call this API.
    // Production: restrict Access-Control-Allow-Origin to your actual
    // frontend origin(s) rather than '*'.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

    const url = new URL(req.url, 'http://localhost');
    req._pathname = url.pathname;
    req.query = Object.fromEntries(url.searchParams.entries());

    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        res.status(400).json({ error: 'invalid JSON body' });
        return;
      }
    } else {
      req.body = {};
    }

    const handled = await root.handle(req, res, '');
    if (!handled && !res.writableEnded) {
      res.status(404).json({ error: 'not found' });
    }
  });

  server.use = root.use.bind(root);
  server.get = root.get.bind(root);
  server.post = root.post.bind(root);
  server.delete = root.delete.bind(root);
  server.put = root.put.bind(root);
  return server;
}

module.exports = { createApp, Router };
