// scripts/require-database-url.js
//
// Guard for `npm run test:pg`. Without DATABASE_URL the suite falls
// back to the embedded engine and passes — running exactly what
// `npm test` just ran, while the output says "pg". Someone reads that
// as "verified against a real PostgreSQL server" when nothing of the
// sort happened. Fail loudly instead.
//
// Note this script is also why test:pg does not read backend/.env: the
// point of the guard is that you have to say, out loud and per run,
// which server you are about to TRUNCATE.

if (!process.env.DATABASE_URL) {
  console.error(`
test:pg needs DATABASE_URL — it is the whole point of this script.
Without it the suite runs against the embedded PostgreSQL, which is
what \`npm test\` already does.

  !! Both suites TRUNCATE every table on entry. Point this at a
  !! THROWAWAY database. Never at Neon, never at anything in
  !! backend/.env, never at anything with real scans in it.

A local PostgreSQL is the easiest throwaway. Create the database once:

  createdb -U postgres tfs_test

then, per run:

  PowerShell:  $env:DATABASE_URL = "postgresql://postgres:PASSWORD@localhost:5432/tfs_test"; npm run test:pg
  bash:        DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/tfs_test npm run test:pg

If \`createdb\` is not found on Windows, the EDB installer puts it in
C:\\Program Files\\PostgreSQL\\<version>\\bin, which is not added to PATH
by default.

Alternatively \`docker compose up postgres\` from the repository root
starts one on 5432 with the credentials in docker-compose.yml
(postgres://tfs:tfs@localhost:5432/tfs_logistics) — but that needs a
running Docker daemon.
`);
  process.exit(1);
}
