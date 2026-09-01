// src/lib/auth.js
//
// Issues and verifies signed session tokens. The token format is
// JWT-shaped (base64url header.payload.signature, HMAC-SHA256) and
// verifies the same way a real JWT library would — but this is a
// deliberately minimal implementation using only `node:crypto`, so it
// runs with zero npm install. Swap for the `jsonwebtoken` package
// (already the Development Stack recommendation) as a near-drop-in
// replacement; the payload shape below is what matters, not the
// signing implementation.
//
// SSO SWAP POINT: `login()` below currently issues a token for any
// operator/role/site combination — there is no real identity check.
// Per the Production Stack Decision Record, this MUST be replaced with
// real SSO (verifying against your identity provider) before this
// system holds real inventory data. Everything downstream of login
// (token verification, role enforcement) is written to be correct
// regardless of how the token was issued, so only login() itself needs
// to change.

const crypto = require('node:crypto');

const SECRET = process.env.AUTH_SECRET || 'dev-only-secret-change-in-production';
const TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12-hour shift-length session

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}
function sign(headerAndPayload) {
  return crypto.createHmac('sha256', SECRET).update(headerAndPayload).digest('base64url');
}

/** Issues a session token for an operator. This is the SSO swap point — see file header. */
function issueToken({ operatorName, role, siteCode }) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: operatorName,
    role,
    site: siteCode || null,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  }));
  const signature = sign(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

/** Returns the decoded payload if the token is valid and unexpired, otherwise null. */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`);
  // Timing-safe comparison — avoids leaking signature validity via response-time side channel.
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof decoded.exp !== 'number' || decoded.exp < Math.floor(Date.now() / 1000)) return null;
  return decoded;
}

const VALID_ROLES = ['DC', 'TDT', 'Hub', 'WSW', 'Viewer'];

module.exports = { issueToken, verifyToken, VALID_ROLES, TOKEN_TTL_SECONDS };
