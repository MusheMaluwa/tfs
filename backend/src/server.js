// src/server.js
//
// Environment variables come directly from the process environment — no
// dotenv dependency:
//
//   PORT           defaults to 4000
//   DATABASE_URL   postgres://user:pass@host:5432/db — when set, the API
//                  talks to that server. When unset it runs the embedded
//                  Postgres in backend/.pgdata instead (see src/db.js),
//                  which is what makes `npm run dev` work with nothing
//                  installed.
//   PGLITE_PATH    where that embedded database lives; ':memory:' for a
//                  throwaway one.
//   AUTH_SECRET    token signing key.
//
// For local dev, export them in your shell or use `env VAR=val npm run dev`.
const { createApp } = require('./lib/httpApp');
const db = require('./db');

const app = createApp();

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req._pathname}`);
  next();
});

// Health reports which engine answered, because "it's up" and "it's
// talking to the database you think it is" are different questions —
// and with two ways to reach Postgres, the second one is worth asking.
app.get('/api/health', async (req, res) => {
  try {
    await db.get('SELECT 1');
    res.json({ ok: true, service: 'tfs-logistics-backend', database: db.kind() });
  } catch (err) {
    res.status(503).json({ ok: false, service: 'tfs-logistics-backend', error: 'database unreachable' });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/sites', require('./routes/sites'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/manifests', require('./routes/manifests'));
app.use('/api/exceptions', require('./routes/exceptions'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/touchpoints', require('./routes/touchpoints'));

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  // Connect and apply the schema BEFORE accepting traffic, so the first
  // request never races the migration. A database that cannot be
  // reached is a hard startup failure, not a server that answers 500s.
  db.ready()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`[tfs-logistics-backend] listening on http://localhost:${PORT} (database: ${db.kind()})`);
      });
    })
    .catch((err) => {
      console.error('[tfs-logistics-backend] could not reach the database:', err.message);
      process.exit(1);
    });
}

module.exports = app;
