# Sync-Integration Phase A Handoff

> Repo path: `docs/phases/sync-integration/phase-A.md`. Commit this file. It is the state of record for Phase A of the sync-integration workstream.
> Companion: `shared/contract.js` holds the current interface shape; this document references it, it does not duplicate it. Read the workstream brief (`docs/phases/sync-integration/README.md`) first.

**Phase:** A — Portal schema and service shell
**Date:** 2026-07-15
**Status:** Code complete and statically verified. **The live steps are deliberately deferred** (see §4): migration 005 is not yet applied to the DB, the dry-run has not been run, and the three portal emails have not been sent. Do these to fully close Phase A.
**One-line summary:** The portal-sync service shell exists end to end — core loop, three stubbed portal modules, a protected manual trigger route, and a dormant daily cron — all adapted to migration 005's schema and the repo's ESM + zod conventions, with no live database writes yet.

---

## 1. What shipped

- Service skeleton under `server/services/portal-sync/`, ported from the portal-sync skill's CommonJS assets to the repo's ESM house style:
  - `core/db.js` — upsert helpers written **against migration 005's actual columns**, reusing the existing pooled `query` from `server/db.js` (no second pool). Metrics upsert on 005's expression index `portal_listing_metrics_daily_uq` so a same-day re-run overwrites the day rather than duplicating.
  - `core/sync.js` — the generic per-portal loop (login → fetch → upsert), writing to `portal_sync_runs`. One portal failing is caught and recorded; the others continue. `openContext` is injectable for testing.
  - `core/browser.js` — Playwright bootstrap with per-portal persistent storage state. **Playwright is lazy-imported**, so Phase A (all portals skipped) runs without it installed.
  - `portals/buyrentkenya.js`, `portals/property24.js`, `portals/kedwell.js` — interface stubs. `isConfigured` checks real creds honestly; `login`/`fetchListings` throw a clear "not implemented yet" so a fetcher can never fake data before its phase builds selectors.
  - `index.js` — the portal registry, `runPortalSync(trigger)`, and `startPortalCron()`.
- Contract: added `portalSyncRun` (`POST /api/portal-sync/run`), mirroring `syncFacebook`. Returns `{ runs: [{ portal, status: ok|skipped|error, listings, error }] }`.
- Server wiring (`server/index.js`): registered the route **below the `/api` auth gate** (token required whenever a password is set, same as the other sync routes), and call `startPortalCron()` from the `listen` callback.
- Env: `server/env.js` and `.env.example` gained the `BUYRENTKENYA_*` / `PROPERTY24_*` / `KEDWELL_*` credentials and the `PORTAL_SYNC_*` knobs. All optional; absent creds = disabled.
- `.gitignore`: added `.storage/` (the Playwright cookie cache is credential-equivalent and must never be committed).
- Dependency: `node-cron` added to the server workspace (the app had no scheduler before this — every other sync is a manual POST).
- Verified statically (no DB writes, per the build-only decision): the full ESM graph imports, `node --check` passes on every new/edited file, the contract response schema accepts a representative payload and rejects a bad status, and the registry reports three portals all skipped under an empty env.

## 2. Contract diff

- Added: `portalSyncRun` (`POST /api/portal-sync/run`). No existing shapes changed.

## 3. Environment state

- `.env.example` documents seven portal credential names (all blank) and five `PORTAL_SYNC_*` knobs. `env.js` validates them all as optional strings.
- `PORTAL_SYNC_ENABLED` gates the cron: it arms **only** when the value is exactly `"true"`. Left unset, so the cron is dormant.
- No portal credentials are set in `.env`. Every portal is therefore "skipped".
- Cron default (when enabled) is `0 7 * * *` — 07:00 daily, after the social sync's 06:00.

## 4. Open issues / what's needed to close Phase A

- **Migration 005 is NOT yet applied to the live Supabase.** It must be run before any portal-sync route or cron can write (the tables don't exist yet). It is idempotent (`IF NOT EXISTS`). Apply it via whatever the "applied live" convention is (phases 3–4 applied migrations by hand).
- **The dry-run has not been run.** Phase A's verification is: `POST /api/portal-sync/run` (with auth) returns three `skipped` runs and three `skipped` rows land in `propiq.portal_sync_runs`. Do this after applying 005.
- **The cron stays off** until 005 is applied. Then set `PORTAL_SYNC_ENABLED=true` to arm it.
- **Portals confirmed they have NO API** (BuyRentKenya, Property24). This settles Phase B/C: both are **Playwright fetchers**, not REST clients. Kedwell remains parked pending the subscription decision.
- **BuyRentKenya offers no read-only tier AND no additional sub-users** (confirmed). So the fetcher must use Blue Falcon's **primary BuyRentKenya login** — the skill's last-resort option. Accepted with mitigations (see §5). `BUYRENTKENYA_EMAIL`/`BUYRENTKENYA_PASSWORD` = the master login.
- **Property24 email still pending** — same read-only sub-account request as drafted; its answer may differ from BuyRentKenya's. A user action (I don't send email); record the send date and outcome when done.
- **Playwright is not installed.** Intentional — Phase A needs no browser. Phase B installs it (`npm i playwright -w server` + `npx playwright install chromium`) when the first real fetcher is built.
- **Schema divergence resolved in favor of 005:** the skill's skeleton assumed `metric_date`, a shared `sync_runs` table, and `raw` columns. Per the brief's "repo wins" rule, `core/db.js` was rewritten against 005 (`captured_at`, `source`, dedicated `portal_sync_runs`). The one `raw` piece was re-added in **Phase B via migration 007** (`raw jsonb` on `portal_listing_metrics`), because the scraper's selector-diffing strategy genuinely needs it — a portal-only deviation from the API-based social tables.

## 5. Decisions and why

- **`core/db.js` rewritten against 005, not copied from the skill skeleton.** The brief is explicit that repo conventions win; the skeleton's schema would not match the migration the workstream already committed.
- **The cron is off by default** (`PORTAL_SYNC_ENABLED` gate). The app had no background scheduler, and 005 isn't applied — a scheduler that wrote to non-existent tables on boot would be a landmine. Off until a human turns it on.
- **Playwright is lazy-imported** so the skipped-only path (Phase A's entire behavior) needs no heavy dependency or browser download.
- **Portal stubs throw rather than return empty data.** A stub that silently returned `[]` would look like a working fetcher finding no listings; throwing keeps "not built yet" honest in the audit trail.
- **Build-only, no DB writes this phase** (user's call): all live database steps were deferred to keep the change reviewable and reversible before anything touched production.
- **BuyRentKenya uses the master login, with mitigations** (no read-only or sub-user tier exists). Mitigations: (1) the fetcher is read-only *by behavior* — it navigates and reads, never clicks a mutating control, enforced as an invariant in `portals/buyrentkenya.js`; (2) the password lives only in `.env` (gitignored) and the session cache in `.storage/` (gitignored); (3) `browser.js` reuses stored cookies so most runs skip the login form, minimizing password-over-the-wire exposure; (4) **operational, not yet automated:** rotate the BuyRentKenya password quarterly and immediately if anyone with server/`.env` access leaves.

## 6. Next-phase entry points

- **Close Phase A first:** apply migration 005, run the dry-run, confirm three skipped rows, then flip `PORTAL_SYNC_ENABLED=true`. Send the three portal emails and record the date above.
- **Then Phase B — Backfill + BuyRentKenya fetcher:** complete the TODOs in `server/migrations/006-backfill-buyrent-manual-stats.sql` against the real `propiq.buyrent_manual_stats` columns (run `SELECT * FROM propiq.buyrent_manual_stats LIMIT 5;` first) and run it. Then the **Playwright fetcher** in `portals/buyrentkenya.js` (BuyRentKenya confirmed no API), built with `PORTAL_SYNC_HEADLESS=false` against the live CRM per the skill's `references/buyrentkenya.md`. Install Playwright first (`npm i playwright -w server` + `npx playwright install chromium`). Close when a scheduled scrape lands real numbers two days running and a same-day re-run does not grow row counts.
