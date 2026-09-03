// src/server.js
//
// Environment variables come directly from the process environment — no
// dotenv dependency:
//
//   PORT           defaults to 4000
//   MONGODB_URI    mongodb+srv://user:pass@cluster.mongodb.net/ — when
//                  set, the API talks to that deployment. When unset it
//                  starts a throwaway in-process MongoDB instead (see
//                  src/db.js), which is what makes `npm run dev` work
//                  with nothing installed.
//   MONGODB_DB     database name inside that deployment; defaults to
//                  tfs_logistics.
//   MONGODB_TIMEOUT_MS
//                  how long to wait for a server before giving up;
//                  defaults to 10000. A wrong password or an IP that is
//                  not on the Atlas access list should surface as a
//                  startup error in seconds, not a hang.
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

// Health reports which deployment answered, because "it's up" and
// "it's talking to the database you think it is" are different
// questions — and with two ways to reach MongoDB, the second one is
// worth asking.
app.get('/api/health', async (req, res) => {
  try {
    await db.ping();
    res.json({ ok: true, service: 'tfs-logistics-backend', database: db.kind(), databaseName: db.name() });
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
