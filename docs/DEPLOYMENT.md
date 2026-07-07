# Deploying Blue Falcon Analytics

The app has two deployable halves plus a database that is already hosted:

- **Database** — Supabase (PropIQ project). Already in the cloud; nothing to deploy.
- **Backend** — the Express server in `server/`. Needs an always-on Node host: **Render** (render.com) free/starter tier works; Railway and Fly are equivalents.
- **Frontend** — the Vite/React app in `client/`. Static after build: **Vercel** (vercel.com) free tier.

Deploy the backend first (the frontend needs its URL).

## 0. Before anything: set the password

A public deployment without `APP_PASSWORD` is an open door to leads' phone
numbers and listing edits. The backend requires a login whenever
`APP_PASSWORD` is set (12+ characters). Pick the password before starting.

## 1. Push the repo to GitHub

Both hosts deploy from a GitHub repo. `.env` is gitignored — secrets never
leave this machine except as host environment variables (step 2).

## 2. Backend on Render

1. render.com → New → **Web Service** → connect the GitHub repo.
2. Settings:
   - Root directory: (repo root)
   - Build command: `npm install`
   - Start command: `npm run dev -w server` — better: add a
     `"start": "node index.js"` script to `server/package.json` and use
     `npm start -w server` (no --watch in production).
3. Environment variables (Render dashboard → Environment). Copy the VALUES
   from the local `.env` — same names:
   - `DATABASE_URL`, `META_ACCESS_TOKEN`, `IG_USER_ID`,
     `FB_ACCESS_TOKEN`, `META_APP_ID`, `META_APP_SECRET`
   - `APP_PASSWORD` — the new password
   - `PORT` — Render sets its own; the env schema's default handles it,
     but set `PORT` to Render's provided value if asked.
4. Deploy. Note the service URL, e.g. `https://blue-falcon-api.onrender.com`.
5. Check `https://<service>/api/health` returns `{"ok":true,...}` and any
   other endpoint returns 401 without a token.

**Caveat — token persistence:** the server rewrites `FB_ACCESS_TOKEN` in
`.env` after a token exchange. On a host, the filesystem is ephemeral and
there is no `.env`; the rewrite fails harmlessly (logged, in-memory value
still used). Long-term the exchanged token should go in the DB or the
host's env API — noted as an open issue in the Phase 5 handoff.

## 3. Frontend on Vercel

1. vercel.com → Add New → Project → import the same repo.
2. Settings:
   - Root Directory: `client`
   - Framework preset: Vite (auto-detected)
3. Environment variable:
   - `VITE_API_URL` = the Render URL (no trailing slash), e.g.
     `https://blue-falcon-api.onrender.com`
4. Deploy. The dashboard link is the Vercel URL, e.g.
   `https://blue-falcon-analytics.vercel.app` — it will show the login
   screen; the password opens it.

## 4. After deploying

- The Marketing sync buttons work from the deployed app exactly as locally
  (the backend holds the Meta tokens).
- Token renewals (~60 days, see `docs/phases/phase-4.md`) now mean updating
  the env var on Render, not `.env`.
- Local development is unchanged: no `APP_PASSWORD` locally = no login.
