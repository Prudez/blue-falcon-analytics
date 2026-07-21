# Sync Integration Workstream, Milestone 2: Meta Connectors

> Repo path: `docs/phases/sync-integration/m2-meta-connectors.md`. Commit this file. It is the state of record for M2 of the connector-framework track.
> Read the workstream brief (`docs/phases/sync-integration/README.md`) and `m1-connector-framework.md` first.

**Milestone:** M2 — Facebook and Instagram connectors on the framework
**Date:** 2026-07-21
**Status:** Code complete and smoke-verified against stubbed Graph responses and a fake pool. **The live acceptance run is pending:** `POST /api/connectors/run/facebook` against production has not been executed. Run it to close M2.
**One-line summary:** M1 open issues 1 and 3 are closed, the db layer now writes the live schema, and Facebook and Instagram run as `ApiConnector` subclasses that reuse the proven server fetchers via dynamic import.

---

## 1. What shipped

- **`core/db.js` rewritten against the live schema (closes M1 open issue 1).** Writes now target `propiq.posts`, `propiq.post_metrics`, `propiq.platform_accounts`, `propiq.account_metrics`, and `propiq.portals` by `code`. The skeleton's `social_posts` / `social_post_metrics` / `slug` references are gone; the smoke test asserts they never appear in emitted SQL. Portal metric upserts use 005's per-UTC-day expression index and persist `raw` (007); portal listing upserts carry `status` and no `raw`, matching the live table.
- **Write semantics follow the live app, not the skill skeleton.** Social metrics APPEND one row per capture (`captured_at DEFAULT now()`), exactly like the manual sync routes; there is no daily upsert for social. Portal metrics still upsert per day. `posts.property_id` is NOT NULL, so the shell-post fallback was removed: an unmatched post is counted (`postsSkipped` / `postMetricsSkipped`) and never written.
- **`core/models.js` reshaped to match:** `SocialMetricModel` lost `metric_date`, gained `total_interactions` and a `source` enum; `AccountModel` and a `FetchResult.accounts` array are new; portal models mirror 005/007.
- **`connectors/facebook.js`** — `ApiConnector` subclass. Reuses `server/fetchers/facebook.js` (ESM) via dynamic import from the CJS subtree, so the repo keeps one Facebook client. Matching mirrors the `syncFacebook` route: `platform_links` rows resolve `property_id`; only matched posts get insights calls and rows. Long-lived token exchange happens in-memory per run (see decisions).
- **`connectors/instagram.js`** — same pattern over `server/fetchers/instagram.js`, honoring both token flavors (`IG...` addresses `/me`; `EAA...` requires `IG_USER_ID`) and the `views`-not-`impressions` rule. `isConfigured` encodes the flavor rule so a half-configured env reads `skipped`, never `failed`.
- **`connectors/meta-shared.js`** — Graph error classification: code 190/102 → `TokenExpiredError` (token-expired alert), 10/200–299 → `AuthError`; anything else propagates with its real message.
- **Connector db access:** the manager now injects the db layer into connectors (`this.db`), read-only by convention (`getPlatformLinks`); all writes remain centralized in `persistFetchResult`.
- **Trigger routes moved below the `/api` auth gate (closes M1 open issue 3).** `POST /api/connectors/run[/:name]` now requires a token whenever `APP_PASSWORD` is set, same as every other sync route.
- **`core/config.js`** gained the env names the live `.env` actually holds (`FB_ACCESS_TOKEN`, `FB_PAGE_ID`, `META_ACCESS_TOKEN`, `IG_USER_ID`); the never-populated `META_PAGE_ID` / `META_IG_BUSINESS_ID` / `META_LONG_LIVED_TOKEN` names remain accepted for compatibility.
- **`smoke-test.js` extended:** both Meta connectors run end to end through `ConnectorManager` against stubbed `fetch` and a statement-recording fake pool, asserting live table names, correct metric parameter order, the NOT-NULL guard, and `isConfigured` logic. All passing.

## 2. Contract diff

No changes to `shared/contract.js`. The `/api/connectors/*` routes remain manual dev triggers outside the contract; they enter it at M4 (dashboard integration), per the M1 handoff.

## 3. Environment state

- No new env keys. The connectors read the keys phases 3–4 already put in `.env`: `FB_ACCESS_TOKEN` (+ optional `FB_PAGE_ID`, `META_APP_ID`, `META_APP_SECRET`) for Facebook; `META_ACCESS_TOKEN` (+ `IG_USER_ID` for EAA-flavor tokens) for Instagram.
- No new tables. sql/001 (`sync_runs`, `portals` seed) is already applied to production per the M1 handoff.
- Windows note unchanged: standalone runs need `node --env-file=.env services\connectors\index.js`.
- Both Meta tokens still expire around early September 2026. When that lands, expect `token-expired` alerts and `failed` rows in `sync_runs` with a code-190 detail; renewal flows are in the main phase-4 handoff.

## 4. Open issues / known-broken

1. **The live acceptance run has not happened.** M2's criterion — `POST /api/connectors/run/facebook` writes real rows into `propiq.post_metrics` and the `sync_runs` row reads `success` with counts — was verified only against stubs. Run it against production to close M2. Note the framework writes status `success`, not `ok`.
2. **Two audit tables still exist (carried from M1 issue 2).** The framework writes `sync_runs`; the older `server/services/portal-sync` writes `portal_sync_runs` with its own cron. Untouched this milestone; consolidation is the M3 decision. Do not remove or rename `portal_sync_runs` before then.
3. **Duplicate metric captures are possible on the same day.** The connector cron/manual runs and the existing `syncFacebook` / `syncInstagram` routes both append to `post_metrics`. That matches the table's time-series design (dashboards read the latest capture), but running both paths daily doubles row growth. Decide in M3 whether the routes delegate to the framework.
4. **`platform_links.post_id` reconciliation stays with the routes.** The connectors deliberately do not update `platform_links.post_id` (a UI-facing write outside `persistFetchResult`). Until M3 consolidates, a link pasted after the last manual route sync keeps a placeholder `post_id` even though the framework has stored its post and metrics.
5. **Sub-connector env validation gap (minor).** `IG_USER_ID` in the framework's config is a plain optional string; `server/env.js` enforces numeric. A malformed value fails at the Graph call, not at startup.

## 5. Decisions and why

- **ESM fetchers loaded via dynamic import, not copied into CJS.** "Port, do not rewrite" resolved toward a single source of truth: `await import()` of the server fetchers works from the CJS subtree in every supported Node, and any future fetcher fix lands in both the routes and the connectors at once.
- **Token exchange is in-memory per run; the framework never writes `.env`.** The manual `syncFacebook` route already persists exchanged tokens via `persistEnvValue`; a background service editing dotfiles is a foot-gun. Cost: an exchange call per run when app credentials are set, which is negligible.
- **No shell posts.** The live `posts.property_id NOT NULL` constraint makes the skeleton's create-a-stub-post fallback impossible. Matching moved into the connectors (where the platform-specific key logic lives), and unmatched data is counted and dropped. This is also the correct product behavior: the dashboard only cares about posts tied to listings.
- **Social metrics append; portal metrics upsert.** The divergence is deliberate and mirrors the live schema: API syncs run on schedule and a trajectory of captures is the point; scrapers re-run within a day and must overwrite. Documented in `models.js` so M3 does not "fix" it.
- **Connectors get read-only db access rather than pre-fetched inputs.** The manager cannot know which reads a connector needs (links for Meta, nothing for portals). Injecting the db layer with a documented read-only convention was the smallest honest design; writes stay centralized so the audit counts stay truthful.

## 6. Next-phase entry points

1. **Close M2 live (Jairus, on the dev machine):** merge/apply this branch, restart the server, sign in if `APP_PASSWORD` is set, then `POST /api/connectors/run/facebook` and `POST /api/connectors/run/instagram`. Confirm `sync_runs` rows read `success` with non-zero counts and fresh rows land in `propiq.post_metrics`. Also run `node services/connectors/smoke-test.js` once locally.
2. **M3 — consolidation and portals:** decide whether `syncFacebook` / `syncInstagram` routes delegate to the framework (closes open issues 3 and 4 here and M1 issue 2's sibling concern), whether the framework absorbs `server/services/portal-sync` (one audit table), then build the BuyRentKenya `BrowserConnector` per the portal-sync skill — noting migration 005's `portal_listing_metrics` must be confirmed present live first (the M1 live-table list did not include it; 005 is idempotent, re-run it).
3. **Kedwell:** still a stub pending the subscription decision; nothing here changes that.
