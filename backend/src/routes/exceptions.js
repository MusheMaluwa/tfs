// src/routes/exceptions.js
const { Router } = require('../lib/httpApp');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

const router = new Router();

router.get('/', requireAuth, (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json(db.all(`SELECT * FROM exceptions ORDER BY ts DESC LIMIT ?`, [limit]));
});

module.exports = router;
