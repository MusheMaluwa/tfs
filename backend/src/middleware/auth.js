// src/middleware/auth.js
const { verifyToken } = require('../lib/auth');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.user = payload; // { sub, role, site, iat, exp }
  next();
}

/** Use after requireAuth. Pass one or more roles that may call this route. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: `requires role: ${roles.join(' or ')}` });
    next();
  };
}

module.exports = { requireAuth, requireRole };
