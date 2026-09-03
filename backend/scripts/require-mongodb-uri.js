// scripts/require-mongodb-uri.js
//
// Guard for `npm run test:atlas`. Without MONGODB_URI the suite falls
// back to the in-process MongoDB and passes — running exactly what
// `npm test` just ran, while the output says "mongodb". Someone reads
// that as "verified against a real cluster" when nothing of the sort
// happened. Fail loudly instead.
//
// Note this script is also why test:atlas does not read backend/.env:
// the point of the guard is that you have to say, out loud and per run,
// which deployment you are about to empty.
//
// The database NAME is checked in code as well — see
// src/__tests__/helpers/reset.js, which refuses to delete anything in a
// database whose name does not end in `_test`. This message and that
// check are deliberately redundant; the one you can skip by not reading
// is the one in this file.

const missing = [];
if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
if (!process.env.MONGODB_DB) missing.push('MONGODB_DB');

if (missing.length) {
  console.error(`
test:atlas needs ${missing.join(' and ')} — that is the whole point of
this script. Without them the suite runs against the in-process
MongoDB, which is what \`npm test\` already does.

  !! Both suites DELETE every document on entry. Point this at a
  !! THROWAWAY database. Never at your production cluster's
  !! tfs_logistics, never at anything in backend/.env, never at
  !! anything with real scans in it.

A separate database inside the same Atlas cluster is the easiest
throwaway — Atlas creates it on first write, and MONGODB_DB is what
picks it:

  PowerShell:
    $env:MONGODB_URI = "mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/"
    $env:MONGODB_DB  = "tfs_test"
    npm run test:atlas

  bash:
    MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/" \\
    MONGODB_DB=tfs_test npm run test:atlas

Alternatively \`docker compose up mongo\` from the repository root
starts a local single-node replica set on 27017
(mongodb://localhost:27017/?replicaSet=rs0) — but that needs a running
Docker daemon. A standalone mongod will NOT do: multi-document
transactions require a replica set, and every touch point uses one.
`);
  process.exit(1);
}
