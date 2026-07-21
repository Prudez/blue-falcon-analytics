# Workstream Brief: Sync Integration (portals, TikTok API, X import)

> Repo path: `docs/phases/sync-integration/README.md`. Commit this file. It is the standing brief for this workstream, linked from the main project brief's roadmap.
> A fresh chat reads the main brief first, follows the link here, then reads the latest `docs/phases/sync-integration/phase-N.md`, then `shared/contract.js`, and continues without needing anything re-explained.

## What this workstream is

The app already syncs Instagram and Facebook via API (main phases 3 and 4) and covers TikTok, X, and custom platforms by manual entry into `post_metrics` with `source='manual'`. This workstream extends ingestion in three directions the main roadmap does not cover: **property portal analytics** (BuyRentKenya, Property24, Kedwell) via browser automation of Blue Falcon's own agent CRMs, **TikTok upgraded from manual to API** once the Display API application is approved, and **X upgraded from raw manual entry to a structured CSV import route** fed by analytics.x.com exports.

Two Claude skills define the reusable designs: `social-sync` (TikTok fetcher, CSV import route) and `portal-sync` (Playwright fetchers, credential rules, selector strategy). Their SKILL.md files are the design authority for fetcher code. This brief covers only their integration into this app. Where a skill's generic schema differs from this repo's conventions, **the repo's conventions win**; migration 005 is the portal schema adapted to the 004 house style (integer identity ids, `captured_at` time series, `source` check, no credentials in the database).

## Stack and conventions

- Same as the main brief: Node/Express server, Vite/React client, `shared/contract.js` as the interface source of truth, propiq schema on the existing PropIQ Supabase, api-keys skill for secrets, migrations in `server/migrations/` numbered `00N-description.sql`.
- Portal logins are the highest-sensitivity secrets in `.env`. Server-side only. Playwright storage state (cookies) is cached under `.storage/portal-sync/` (gitignored) so most runs skip the login form.
- Portal metrics are a time series like `post_metrics`, with one guard the social tables do not have: a unique index per listing per capture day, because scrapers re-run more than API syncs. Writes upsert against it.
- Kedwell stays unconfigured until the trial subscription decision and their API answer. See the portal-sync skill's `references/kedwell.md`.

## Phase roadmap

- [ ] **Phase A - Portal schema and service shell.** Run `server/migrations/005-portal-tables.sql`. Copy the portal-sync skill's service skeleton into `server/services/portal-sync/`, adapt `core/db.js` to the 005 tables and the existing pg pool, register the cron and a protected `POST /api/portal-sync/run` in the contract. Verify with a dry run: all three portals appear in `portal_sync_runs` as `skipped` (no credentials yet). Send the three portal emails (API question to BuyRentKenya, Property24, Kedwell sales contact) and record the send date in the phase handoff.
- [ ] **Phase B - Backfill and the BuyRentKenya fetcher.** Complete the TODOs in `server/migrations/006-backfill-buyrent-manual-stats.sql` against the real `buyrent_manual_stats` columns and run it. Then, per BuyRentKenya's answer: REST client if they offer an API or export, otherwise the Playwright fetcher per the skill's `references/buyrentkenya.md`, built with `PORTAL_SYNC_HEADLESS=false` so selectors are shaped against the live CRM. Close the phase when a scheduled scrape lands real numbers in `portal_listing_metrics` two days running and a same-day re-run does not grow row counts.
- [ ] **Phase C - Property24 fetcher, portal data on the Marketing page.** Second fetcher per `references/property24.md`. Extend `marketingOverview` in the contract so the Marketing page shows portal views/inquiries per property next to the social numbers, joined through `properties`. This is the payoff view: social reach and portal intent for one listing on one screen. Feeds the main roadmap's Phase 5 attribution work.
- [ ] **Phase D - TikTok API upgrade and X CSV import.** When the TikTok Display API app is approved: build the fetcher per the social-sync skill's `references/tiktok.md`, writing to `post_metrics` with `source='api'`; manual TikTok entry stops. Add the X CSV import route per `references/manual-import.md`, parsing analytics.x.com exports into `post_metrics` (posts created in `posts` when missing). Kedwell joins here or later if the subscription continues.

Mark phases done as they close. Handoffs live in this folder as `phase-A.md`, `phase-B.md`, and so on, following the phase-handoff skill's template.

### Connector framework milestone track

A second track, started after Phase A, unifies all ingestion behind one connector framework (`services/connectors/`) with a single `sync_runs` audit table. It runs alongside the A–D phases; M3 decides how the two consolidate.

- [x] **M1 — Framework core.** Lifecycle, manager, kedwell stub, `sql/001` applied live. See `m1-connector-framework.md`.
- [x] **M2 — Meta connectors.** db layer aligned to the live schema; Facebook and Instagram as `ApiConnector` subclasses; trigger routes auth-gated. Code complete; live acceptance run pending. See `m2-meta-connectors.md`.
- [ ] **M3 — Consolidation and first portal fetcher.** Routes/framework and portal-sync/framework consolidation decisions, then BuyRentKenya as a `BrowserConnector`.
- [ ] **M4 — Dashboard integration.** Connector runs and health surfaced in the app; `/api/connectors/*` enters the contract.

## External dependencies gating phases

- TikTok Display API application (scopes `user.info.basic`, `user.info.stats`, `video.list`) filed at developers.tiktok.com; 3 to 7 day review. Gates Phase D. Requires the privacy policy and terms pages live on bluefalconreal.com.
- Portal API answers gate whether Phases B and C build REST clients or Playwright fetchers.
- Kedwell subscription decision gates its fetcher entirely.
- Both Meta tokens expire around early September 2026 (main phase-4 handoff has the renewal flows). Not this workstream's job, but any chat working here should surface it if the date is near.

## Resume protocol

To continue this workstream in any new chat:

1. Read the main brief (`docs/phases/README.md`), then this brief.
2. Read the latest `docs/phases/sync-integration/phase-N.md` if one exists.
3. Read `shared/contract.js`, and the relevant SKILL.md if touching fetchers.
4. Surface open issues from the latest handoff first.
5. Start the next unchecked phase above.

A new chat following these steps needs no further instruction.
