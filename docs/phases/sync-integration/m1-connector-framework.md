# Sync Integration Workstream, Milestone 1: Connector Framework

Status: **Closed.** Acceptance criterion met on 21 Jul 2026: `POST /api/connectors/run` returns `[{ "name": "kedwell", "status": "skipped" }]` from the running app.

## What shipped

- Connector framework at `services/connectors/`: `BaseConnector` lifecycle (isConfigured, init, authenticate, fetchRaw, map, dispose), `ApiConnector` and `BrowserConnector` base classes, `ConnectorManager`, config validation, structured logging, response models, classified errors, upsert-only db layer.
- Kedwell stub connector registered; reports `skipped` while its credentials are absent.
- Manual trigger routes mounted in `server/index.js`: `POST /api/connectors/run` (all) and `POST /api/connectors/run/:name` (one). Not auth-protected yet.
- Standalone CLI mode: `node --env-file=.env services\connectors\index.js` (optional connector name as arg).
- `sql/001-connector-framework-patch.sql` applied to production Supabase: created unified `propiq.sync_runs` (integer identity id; source, source_type, status, detail, counts, started_at, finished_at) and seeded `propiq.portals` with buyrentkenya, property24, kedwell on the live column names (`code`, `base_url`).
- Framework verified end to end against production: a real `skipped` audit row exists in `propiq.sync_runs`.
- Framework subtree scoped to CommonJS via `services/connectors/package.json` (`{ "type": "commonjs" }`) because the repo root and `server/` are ESM. Server imports it with default-import-then-destructure.

Key commits: `e270a73` (framework + smoke test), plus the SQL patch fix and server mount commits after it.

## Contract diff

No changes to `shared/contract.js`. The two `/api/connectors/*` routes are manual dev triggers and are not yet in the contract. Add them to the contract when they become part of the app's real surface (M4 dashboard integration).

## Environment state

- No new env keys required for M1. `DATABASE_URL` in the root `.env` is the only key the framework validates as required; per-connector keys are optional and gate whether each connector is enabled.
- Root `.env` already holds Meta keys from phases 3 and 4: `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `FB_ACCESS_TOKEN`, `IG_USER_ID`. M2 starts from these, not from zero.
- Live `propiq` tables relevant to this workstream: `posts`, `post_metrics`, `platform_accounts`, `account_metrics`, `portals`, `portal_listings`, `portal_sync_runs`, `sync_runs`, `properties`, `analytics_cache`, `analytics_history`, `buyrent_manual_stats`, `leads`, `platform_links`, `users`.
- Windows note: standalone runs need `--env-file=.env` because plain node does not load dotenv.

## Open issues / known-broken

1. **`db.js` table names do not match the live schema.** `services/connectors/core/db.js` targets `social_posts`, `social_post_metrics`, and `portal_listing_metrics`. The live schema has `posts`, `post_metrics`, and no `portal_listing_metrics` table. The kedwell skip never touches these paths, so M1 passed; the first real connector write in M2 will fail with relation-does-not-exist. Fix `db.js` to the live names before writing the Facebook connector. Do not create duplicate tables.
2. **Two audit tables exist.** The framework writes `sync_runs`; the older `server/services/portal-sync` writes `portal_sync_runs` and has its own cron (`startPortalCron` in `server/index.js`). Both run side by side today. Decide in M3 whether the framework absorbs that service; until then do not remove or rename `portal_sync_runs`.
3. **Trigger routes are unauthenticated.** `server/auth.js` exists; wrap the `/api/connectors/*` routes with it before any non-local deployment.
4. **Shipped `sql/001` differed from the live schema and was corrected mid-apply.** The committed patch now reflects what actually ran (`code` not `slug`, `base_url` required, `sync_runs` created not altered). Treat the committed file as the source of truth.

## Decisions and why

- Created a fresh unified `sync_runs` instead of reusing `portal_sync_runs`. Existing portal-sync code keeps working untouched; the framework gets the audit shape it was designed around.
- Left `portal_sync_runs` and the existing portal-sync cron in place. Consolidation is an M3 concern, after the framework has real portal connectors.
- Kedwell stays a stub. The subscription is still on free trial and unconfigured; the stub proves the skip path and costs nothing.
- CommonJS scoped to the framework subtree rather than converting the framework to ESM. One small `package.json` beats rewriting every file, and the server consumes it cleanly.
- X connector is parked, not scheduled. Paid API tier; revisit only if X posting becomes material.

## Next-phase entry points (M2: Meta connectors)

1. Fix open issue 1 first: align `services/connectors/core/db.js` with the live table names (`posts`, `post_metrics`, `platform_accounts`, `account_metrics`) and their actual columns. Read `server/migrations/004-phase3-social-tables.sql` for the authoritative shapes (`captured_at` time-series pattern, integer identity ids).
2. Port, do not rewrite: `server/fetchers/facebook.js` and `server/fetchers/instagram.js` contain working auth and mapping code (`exchangeForLongLivedToken`, `resolvePage`, `fetchPagePosts`, `fetchPostInsights`, insights fetching). Wrap them in `ApiConnector` subclasses.
3. Token strategy: derive Page access tokens from the long-lived user token; Page tokens do not expire. Build a token health check that surfaces `auth_required` in `sync_runs`, not a silent refresh. Remember Instagram v22.0 renamed `impressions` to `views`; map to the framework's stable field once, in the connector.
4. M2 acceptance criterion: `POST /api/connectors/run/facebook` writes real rows into `post_metrics` from a manual run, and the `sync_runs` row reads `ok` with counts.
