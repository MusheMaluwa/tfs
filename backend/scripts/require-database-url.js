// scripts/require-database-url.js
//
// Guard for `npm run test:pg`. Without DATABASE_URL the suite falls
// back to the embedded engine and passes — running exactly what
// `npm test` just ran, while the output says "pg". Someone reads that
// as "verified against a real PostgreSQL server" when nothing of the
// sort happened. Fail loudly instead.

if (!process.env.DATABASE_URL) {
  console.error(`
test:pg needs DATABASE_URL — it is the whole point of this script.
Without it the suite runs against the embedded PostgreSQL, which is
what \`npm test\` already does.

  PowerShell:  $env:DATABASE_URL = "postgres://tfs:tfs@localhost:5432/tfs_test"; npm run test:pg
  bash:        DATABASE_URL=postgres://tfs:tfs@localhost:5432/tfs_test npm run test:pg

Point it at a THROWAWAY database — the suites TRUNCATE on entry.
\`docker compose up postgres\` from the repository root starts one.
`);
  process.exit(1);
}
