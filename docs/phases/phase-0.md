# Phase 0 Handoff

> Repo path: `docs/phases/phase-0.md`. Commit this file. It is the state of record for this phase.
> Companion: the API contract file (`shared/contract.js`) holds the current interface shape. This document references it; it does not duplicate it.

**Phase:** 0
**Date closed:** 2026-07-02
**One-line summary:** Walking skeleton scaffolded and wired end to end; the code path is proven, but the live database round-trip is unverified pending real Supabase credentials.

---

## 1. What shipped

- Repo scaffold: npm workspaces at the root (`server`, `client`), `npm run dev` runs both via `concurrently`.
- Endpoint: `GET /api/health` — queries the DB with `SELECT NOW()` through `server/db.js`, returns `{ ok, timestamp }` on success. On a DB failure it returns a 503 with the shared `ErrorResponse` shape instead of leaking the raw error.
- `shared/contract.js` — the interface source of truth, with the `health` entry and the shared `ErrorResponse` shape. Both `server/index.js` and `client/src/api.js` import from it; neither redefines the shape.
- `server/env.js` — Zod-based startup validator. Crashes with the missing key's name if `DATABASE_URL` is absent; does not print values.
- `server/db.js` — node-postgres pool against the Transaction pooler (port 6543), `$1` params, ready for `propiq.`-prefixed queries in later phases.
- `client/src/App.jsx` — bare page that calls the health endpoint on mount and renders the result or the error message.
- `.env.example` committed at the repo root; `.env` is gitignored and untouched by git.

## 2. Contract diff

First phase, so this is the initial contract rather than a diff.

- Added: `health` (`GET /api/health`) — response `{ ok: boolean, timestamp: string (datetime) }`.
- Added: `ErrorResponse` — `{ error: string, message: string }`, shared by every route's failure case.

## 3. Environment state

- Ports: backend `3001`, frontend `3000`.
- Node v24.15.0, npm 11.12.1.
- Env vars in play: `PORT` (default 3001), `VITE_API_URL`, `DATABASE_URL` (required), `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (declared, optional, unused by any code path yet).
- `.env` exists locally from `.env.example` but `DATABASE_URL` is still a placeholder; no real Supabase credentials have been entered.
- Local git needed a `safe.directory` exception added (Windows "dubious ownership" check on this folder); confirmed with the user before adding it globally.

## 4. Open issues / known-broken

- **Live DB connectivity unverified.** `DATABASE_URL` in the local `.env` is a placeholder. The full request path was verified against an unreachable placeholder DB, which correctly produced a 503 with the contract's error shape end to end in the browser. What has not been observed is a real success response (`ok: true` with an actual DB timestamp). Next step: fill the real Transaction pooler connection string into `.env`, restart `npm run dev`, and confirm the frontend renders `Status: ok` with a live timestamp.
- **Supabase key trio unused.** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are declared in the validator and `.env.example` for future phases but nothing reads them yet, since the backend talks to Postgres directly via `DATABASE_URL`. Not a bug, just noting they're inert until a phase needs `supabase-js` or storage.

## 5. Decisions and why

- **npm workspaces** (root `package.json` with `workspaces: ["server", "client"]`) instead of two independent installs, so a shared dependency (`zod`) hoists to the root `node_modules` and resolves from `shared/contract.js` regardless of which side imports it.
- **Both `server/env.js` and `client/vite.config.js` explicitly point their env loader at the repo root**, rather than relying on the default. Each workspace script runs with its own package directory as cwd (`npm run dev -w server` has cwd `server/`), so the default "load `.env` from cwd" behavior of both `dotenv` and Vite missed the root-level `.env` entirely until this was fixed.
- **`server/env.js` loads `.env` with `override: true`.** The dev preview harness injects its own `PORT` into the whole process tree to track the frontend's port. Since `concurrently` spawns both dev servers under one parent, that value leaked into the backend and silently overrode its own `PORT=3001`, making it try to bind the frontend's port. `.env`'s value now wins over an inherited shell var.
- **Empty-string optional env vars are treated as unset.** `dotenv` renders an unset key from `.env` as `""`, not absent, so Zod's `.optional()` alone let a blank `SUPABASE_URL` fail `.url()` validation. Added a small `optional()` wrapper in `server/env.js` that maps `""` to `undefined` before validating.
- **Postgres pool uses `ssl: { rejectUnauthorized: false }`.** Supabase's Transaction pooler requires TLS, but its certificate isn't in the default local trust store.
- **Docs cleanup:** moved the brief from `docs/phases/Brief.md.txt` to the canonical `docs/phases/README.md`, and picked up two files that had already been renamed on disk but not in git (`Codeprompts.md.txt` → `prompts-code.md`, `Designprompts.md.txt` → `prompts-design.md`) as part of the same commit. Removed a stray empty `docs/phases/Prompts README.md.txt`.

## 6. Next-phase entry points

- Start with: fill the real `DATABASE_URL` (PropIQ Supabase project, Transaction pooler, port 6543) into the local `.env`, run `npm run dev`, and confirm `http://localhost:3000` renders `Status: ok` with a live DB timestamp. This is the one thing standing between Phase 0 and a fully proven skeleton.
- Close first: the live DB connectivity open issue above, before starting Phase 1 feature work.
- Next feature needs: Phase 1 (dashboard shell and first KPI cards). Add each new endpoint to `shared/contract.js` first, then the backend query, then the frontend card, following the pattern this phase established for `/api/health`.
