// src/routes/auth.js
//
// SSO SWAP POINT — see src/lib/auth.js header. This endpoint currently
// issues a token for any operator/role/site combination submitted; it
// does not verify identity against anything. Replace the body of
// POST /login with a real check against your identity provider before
// this touches real inventory.

const { Router } = require('../lib/httpApp');
const { issueToken, VALID_ROLES } = require('../lib/auth');
const db = require('../db');

const router = new Router();

router.post('/login', async (req, res) => {
  const { operatorName, role, siteCode } = req.body || {};
  if (!operatorName || !role) return res.status(400).json({ error: 'operatorName and role are required' });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  if (siteCode) {
    const site = await db.get(`SELECT 1 FROM sites WHERE code = ?`, [siteCode]);
    if (!site) return res.status(400).json({ error: 'unknown siteCode' });
  }
  const token = issueToken({ operatorName, role, siteCode });
  res.status(201).json({ token, expiresInSeconds: 12 * 60 * 60 });
});

module.exports = router;
