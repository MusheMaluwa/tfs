// src/server.js
// Environment variables (PORT, DB_PATH, AUTH_SECRET) come directly from
// the process environment — no dotenv dependency needed. For local dev,
// export them in your shell or use `env VAR=val npm run dev`.
const { createApp } = require('./lib/httpApp');

const app = createApp();

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req._pathname}`);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'tfs-logistics-backend' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/sites', require('./routes/sites'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/manifests', require('./routes/manifests'));
app.use('/api/exceptions', require('./routes/exceptions'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/touchpoints', require('./routes/touchpoints'));

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`[tfs-logistics-backend] listening on http://localhost:${PORT}`));
}

module.exports = app;
