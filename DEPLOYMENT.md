# Deploying to Render — Staging/Demo

For letting stakeholders click through the app on a real URL. **Not**
a production deployment — see the callout in Step 6 before sharing
this link outside your team.

## What you'll end up with

- The backend, live at a real `https://*.onrender.com` URL — real
  auth tokens, real database, all 7 touch points + WSW + non-linear
  flows working exactly as tested.
- `mercury-scanner.html`, live at its own `https://*.onrender.com`
  URL, calling that backend.
- **Not included:** `mercury-console.html` — it isn't wired to the
  backend yet (still `localStorage`-only), so deploying it would just
  show a disconnected demo that doesn't reflect real scans. If you
  want the dashboard in this demo, say so and that retrofit can happen
  before you deploy, rather than after.
- A bonus you didn't have in this sandbox: **barcode camera scanning
  will actually work.** It only needs HTTPS to function, and Render
  gives you that automatically — this is the first time this feature
  will be live rather than theoretical.

## Prerequisites

- A free [Render](https://render.com) account (sign up with GitHub —
  makes Step 2 automatic).
- The project pushed to a GitHub repo. If it isn't yet:
  ```bash
  cd tfs-logistics
  git init
  git add .
  git commit -m "Initial commit"
  ```
  Then create an empty repo on GitHub and follow its "push an existing
  repository" instructions.

## Step 1 — Deploy the backend

**First, create the database.** The API needs a MongoDB to point at,
and Render does not offer one — its managed database product is
PostgreSQL. Use MongoDB Atlas, which has a free tier:

1. At <https://cloud.mongodb.com>: create a project and a **free M0
   cluster**. Any region; closer to your Render region is faster.
2. **Database Access** → add a database user with a password. Write
   the password down — Atlas shows it once, and the connection string
   is useless without it.
3. **Network Access** → the Render free plan does not give you static
   outbound IPs, so add `0.0.0.0/0` (allow from anywhere). That makes
   the database password the only thing protecting it, so make it a
   strong one. On a paid Render plan, add its static outbound IPs
   instead and leave it at that.
4. **Connect** → **Drivers** → copy the `mongodb+srv://...` string. It
   contains a literal `<db_password>` placeholder; replace it with the
   real password, and percent-encode any of `: / ? # [ ] @` in it.

The cluster is a replica set, which is what the transactions in the
touch-point logic need. Nothing extra to configure for that.

**Then the web service.**

1. **New +** → **Web Service**.
2. Connect the GitHub repo you just pushed.
3. Fill in:
   | Field | Value |
   |---|---|
   | Name | `tfs-logistics-backend` (or anything) |
   | Root Directory | `backend` |
   | Runtime | `Node` |
   | Build Command | `npm ci --omit=dev` |
   | Start Command | `npm run seed && npm start` |
   | Instance Type | **Free** |
4. Under **Environment Variables**, add:
   - `AUTH_SECRET` → click "Generate" for a random value (do **not**
     leave this unset — the code falls back to an insecure default
     that's fine for local dev, not for anything with a public URL).
   - `MONGODB_URI` → paste the Atlas connection string from above,
     with the real password in it. Without this the API has no
     database: `--omit=dev` deliberately leaves out the in-process
     server that local development falls back to, and startup will
     fail with a message telling you exactly this.
   - `MONGODB_DB` → `tfs_logistics`. The connection string does not
     name a database, so this is where it is decided.
5. Set **Health Check Path** to `/api/health`. It reports which
   deployment answered and which database name it is using, so a green
   check means the API really reached Atlas rather than merely
   booting.
6. Click **Create Web Service**. First deploy takes a few minutes.
7. Once live, copy its URL — looks like
   `https://tfs-logistics-backend-xxxx.onrender.com`. You need this
   for Step 3.

`render.yaml` in the repository root does all of the above as a
Blueprint if you would rather not click through it.

**Why "seed" runs on every start, not just once:** it is safe to
re-run — sites and assets go in through `$setOnInsert` upserts, so a
redeploy tops the demo data up rather than duplicating or wiping it.
Atlas persists across restarts, so real scans survive a redeploy. Drop
`npm run seed &&` from the start command once there is real data you
care about.

## Step 2 — Point the frontend at the backend

Open `frontend/mercury-scanner.html` and find this line near the top
of the `<script>` block:

```js
const API_BASE_URL = window.TFS_API_BASE_URL || 'http://localhost:4000';
```

Add one line directly above the opening `<script>` tag, with the real
URL from Step 1:

```html
<script>window.TFS_API_BASE_URL = 'https://tfs-logistics-backend-xxxx.onrender.com';</script>
<script>
const API_BASE_URL = window.TFS_API_BASE_URL || 'http://localhost:4000';
```

Commit and push this change.

## Step 3 — Deploy the frontend

1. **New +** → **Static Site**.
2. Same GitHub repo.
3. Fill in:
   | Field | Value |
   |---|---|
   | Name | `tfs-logistics-scanner` |
   | Root Directory | `frontend` |
   | Build Command | *(leave blank — nothing to build)* |
   | Publish Directory | `.` |
4. Click **Create Static Site**.
5. Once live, open its URL, log in as any role, and try TP1 — you
   should see it hit your real backend.

## Faster alternative: one Blueprint instead of Steps 1 & 3

`render.yaml` at the repo root defines both services at once. In the
dashboard: **New +** → **Blueprint** → connect the repo → Render
reads `render.yaml` and proposes both services pre-filled. You still
need to do Step 2 (the frontend URL) manually either way — Render
can't know its own backend's URL before that service exists.

## Step 4 — Verify it end to end

The exact same check this project ran throughout development:

1. Open the scanner URL. Log in as **DC Operator** at **JHB-DC1**.
2. Open **TP1**, type `RT-100001`, hit Enter, tap **Open dispatch**.
3. If that succeeds with a toast showing a `MAN-xxxxxx` manifest ID,
   frontend → backend → database is confirmed live.

## Step 5 — Cold starts (free tier)

Render's free web services spin down after ~15 minutes of no traffic
and take 30–60 seconds to wake back up on the next request. Fine for
a demo you're actively walking someone through; jarring if you send a
stakeholder a cold link and they click it expecting instant load. If
that matters, upgrade the backend service to the **Starter** plan
(~$7/month) to keep it always warm — everything else in this guide is
identical either way.

## Step 6 — Before you share this link outside your team

This is a demo, and it's been built and tested as one, but it's worth
repeating plainly since it's now on a real public URL: **there is no
real authentication.** Anyone with the link can log in as any role at
any site — that's fine for a controlled stakeholder walkthrough,
not fine as a general-access link. Don't post it anywhere public, and
treat "staging" as meaning exactly that.
