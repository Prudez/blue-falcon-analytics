# Phase 1 Handoff

> Repo path: `docs/phases/phase-1.md`. Commit this file. It is the state of record for this phase.
> Companion: the API contract file (`shared/contract.js`) holds the current interface shape. This document references it; it does not duplicate it.

**Phase:** 1
**Date closed:** 2026-07-02
**One-line summary:** Dashboard shell and first KPI cards, built on a live connection to the real PropIQ database; the schema needed additive surgery first because the live DB was thinner than the brief assumed.

---

## 1. What shipped

- Migration: `server/migrations/001-phase1-sales-columns.sql`, applied to the live PropIQ project. Adds `status` (default `'available'`, CHECK-constrained), `location`, and `price_kes` to `propiq.properties`, and creates `propiq.leads` (`id`, `property_id`, `name`, `phone`, `source`, `created_at`). Purely additive and idempotent.
- Endpoint: `GET /api/kpis/summary` — the four Overview numbers in one call: active listings, under offer, sold, leads captured.
- Endpoint: `GET /api/listings/by-status` — donut data; emits every status with a zero count included, so the chart legend is stable.
- Endpoint: `GET /api/listings/by-location` — location breakdown; NULL or blank locations are grouped server-side under the literal label `Unspecified`.
- Backend: a `contractRoute` helper in `server/index.js` wraps every GET route with response validation against the contract and the shared error shape on failure.
- Frontend shell: navy sidebar (Overview, Sales, Marketing, Listings), header with page title and two inert controls (date range, export; both arrive in Phase 5), and a live backend-status dot in the sidebar footer.
- Overview page (`client/src/pages/Overview.jsx`): four KPI cards, a listings-by-status donut, and a listings-by-location horizontal bar chart, both in Recharts.
- Client: `api.js` gained a generic `getJson(endpoint)` helper; all fetchers parse responses through the contract. Recharts added as a client dependency.
- Verified end to end in the browser against live data: KPIs render 7 / 0 / 0 / 0, both charts draw, no console errors.

## 2. Contract diff

- Added shared shape: `ListingStatus` (`available | under_offer | sold`). It mirrors the CHECK constraint from migration 001; change both together or neither.
- Added: `kpiSummary` (`GET /api/kpis/summary`).
- Added: `listingsByStatus` (`GET /api/listings/by-status`).
- Added: `listingsByLocation` (`GET /api/listings/by-location`).
- Unchanged: `health`, `ErrorResponse`.

## 3. Environment state

- Migration state: 001 applied to the live PropIQ Supabase project. No migration runner yet; migrations are idempotent SQL files run manually (a one-off `node -e` against `server/db.js`).
- `DATABASE_URL` is live and verified against the real PropIQ project (pooler user `postgres.pjcayuqqqpmfzlhqqptv`, EU-north-1 Transaction pooler, port 6543). The database password was reset during this phase; the old one no longer works anywhere.
- Ports unchanged: backend 3001, frontend 3000. `npm run dev` runs both.
- New client dependency: `recharts`.
- The live `propiq` schema as found this phase: `properties`, `platform_links`, `analytics_cache`, `analytics_history`, `buyrent_manual_stats`, `users`, plus the new `leads`. Row counts at close: properties 7, analytics_history 7, analytics_cache 4, users 1, everything else 0.

## 4. Open issues / known-broken

- **The brief overstates what PropIQ's database contains.** The social tables it lists as reusable (`platform_accounts`, `posts`, `post_metrics`) and the `property_platform_performance` view do not exist in the live DB. Phase 3 and 4 must create them, not port them. The brief's roadmap wording still says "reused as-is"; treat this handoff as the correction.
- **The dashboard shows real but unbackfilled data.** All 7 properties carry the migration default `status = 'available'` and a NULL location, so the donut is one slice and the location chart shows a single "Unspecified" bar. `leads` is empty, so Leads Captured is 0. The user needs to set real statuses, locations, and prices in the Supabase table editor (or Phase 2 adds editing) before the Overview is meaningful.
- **KPI deltas are omitted.** The design mockup shows "vs last period" deltas on each KPI card. There is no historical status data to compute them from, so the cards show plain numbers. Revisit once `analytics_history`-style tracking exists for sales states.
- **Sales, Marketing, and Listings nav items route to placeholders.** Intentional for this phase.

## 5. Decisions and why

- **Extend the propiq schema additively rather than leave it untouched.** User-approved. The alternative was redefining Phase 1's widgets around the data that happened to exist, which deviates further from the brief than adding nullable, defaulted columns the live PropIQ app never reads.
- **Migrations live in `server/migrations/` as committed, idempotent SQL.** No runner until the count justifies one; each file guards itself with `IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS`.
- **One `kpiSummary` endpoint instead of four.** The top row always renders together; one round trip, one loading state.
- **Zero-count statuses are emitted by the backend**, so the frontend never invents categories and the donut legend does not jump between renders.
- **The location widget is a horizontal bar chart, not the Kenya choropleth from the design prompts.** Locations are free text and mostly NULL today. The choropleth needs a structured county field and real data; deferred until both exist (likely Phase 2 or 5).
- **`leads.source` allows `'other'`** in addition to the brief's platform list, so manual entries never violate the CHECK constraint.
- **Wrong-database guard proved its worth:** the first two connection strings supplied pointed at an empty non-PropIQ project and then carried a stale password. Introspecting `information_schema` before building against a "connected" database is now the house habit; a reachable DB is not necessarily the right DB.

## 6. Next-phase entry points

- Start with: backfill. Real statuses, locations, and `price_kes` for the 7 properties, and any real leads, entered in the Supabase table editor. Without this every Phase 2 chart renders empty or single-category.
- Close first: nothing is broken in code. The backfill above is the only blocker, and it is data entry, not development.
- Next feature needs (Phase 2, sales analytics depth): the lead funnel requires a `stage` column on `propiq.leads` (lead → viewing → offer → closed), which is migration 002. Time-series charts can use the existing `created_at` columns. The commission/revenue trend needs a decision on where sale price and commission live; `price_kes` exists on properties, but a closed-sale record (final price, close date) does not yet.
