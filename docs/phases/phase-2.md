# Phase 2 Handoff

> Repo path: `docs/phases/phase-2.md`. Commit this file. It is the state of record for this phase.
> Companion: the API contract file (`shared/contract.js`) holds the current interface shape. This document references it; it does not duplicate it.

**Phase:** 2
**Date closed:** 2026-07-03
**One-line summary:** Sales analytics depth plus a full Listings editor; the phase grew beyond the roadmap slice at the user's request, pulling listings management forward from Phase 5 and laying the platform-links groundwork for Phase 3.

---

## 1. What shipped

- Migration: `server/migrations/002-phase2-sales-depth.sql` — `stage` on `propiq.leads` (lead → viewing → offer → closed, CHECK-constrained, default `'lead'`), and `sale_price_kes` + `sold_at` on `propiq.properties`. Applied live.
- Migration: `server/migrations/003-phase2-price-unit.sql` — `price_unit` on `propiq.properties` (`total | per_month | per_sqft | per_acre`, default `'total'`). Applied live. Added because the real data mixes monthly rents with sale prices.
- Sales endpoints: `GET /api/sales/over-time` (monthly new listings and leads, zero-filled month spine), `GET /api/sales/lead-funnel` (cumulative stage counts), `GET /api/sales/revenue-trend` (monthly sums over sold properties), `GET /api/sales/price-bands` (six fixed KES bands, sale prices only), `GET /api/sales/recent-leads` (latest 10, property name joined).
- Sales page (`client/src/pages/Sales.jsx`): two-series trend line, funnel bars, revenue bars, price-band chart, location bars, recent-leads table with stage pills. Empty states for the widgets that need leads or sold properties.
- Property editing: `GET /api/properties`, `POST /api/properties`, and `PATCH /api/properties/:id` (name, location, status, price, unit). Setting status to `sold` auto-stamps `sold_at` with today; leaving `sold` clears it.
- Platform links: `GET/POST /api/platform-links` and `DELETE /api/platform-links/:id`, writing to PropIQ's existing (previously empty) `platform_links` table.
- Listings page (`client/src/pages/Listings.jsx`): add-listing form; inline editing of name, location, status, price, and unit; per-listing social-posts editor with the built-in four platforms plus free-text custom platforms. Price fields accept and live-format thousands separators.
- Infrastructure: `contractRoute` in `server/index.js` now handles non-GET methods and validates request bodies against the contract (400 on a bad body, 503 on a query failure). `client/src/api.js` gained `sendJson` for endpoints with bodies and `:param` paths. `LocationBars` extracted to `client/src/components/LocationBars.jsx`, shared by Overview and Sales. `client/src/platforms.js` centralizes platform labels/colors with graceful fallbacks for unknown slugs.
- Everything verified in the browser against the live database, including a full create → edit → link → unlink → delete cycle on a throwaway property (removed afterward; data left as found, except one deliberate correction noted below).

## 2. Contract diff

- Added shared shapes: `LeadStage`, `PriceUnit`, `PriceBand`, `PlatformSlug`, `PlatformLink`, `Property`.
- Added endpoints: `salesOverTime`, `leadFunnel`, `revenueTrend`, `priceBands`, `recentLeads`, `listProperties`, `createProperty`, `updateProperty`, `listPlatformLinks`, `addPlatformLink`, `deletePlatformLink`.
- First non-GET endpoints in the contract (`POST`, `PATCH`, `DELETE`); request schemas are now enforced server-side.
- Changed: `platformPerformance` rows' `platform` relaxed from the `SocialPlatform` enum to `PlatformSlug`, since the platform set is now open. `SocialPlatform` remains the list of platforms with fetchers and curated labels.

## 3. Environment state

- Migrations 001–003 applied to the live PropIQ project. Still no runner; idempotent SQL run manually via `node -e` against `server/db.js`.
- Live `propiq.properties` now carries: `status`, `location`, `price_kes`, `sale_price_kes`, `sold_at`, `price_unit`. `propiq.leads` carries `stage`. `propiq.platform_links` is now written by this app (its `post_id` column is stored as `''` meaning "unresolved"; Phase 3 resolves real ids).
- Row counts at close: properties 7, leads 0, platform_links 0.
- Data state: the user backfilled locations and prices between phases (Phase 1's blocker, partially cleared). All statuses are still `available`; `leads` is empty. During verification, Highridge Apartments (35,000 KES) was re-tagged `per_month` — a deliberate correction, kept.
- Ports, deps, and `npm run dev` unchanged. `.claude/launch.json` (config name `dev`, port 3000) drives the preview server.

## 4. Open issues / known-broken

- **No in-app lead capture.** The funnel, recent-leads table, and leads-over-time series all render empty states because `propiq.leads` has no rows and the app has no form to add one. Leads must be entered in the Supabase table editor until a capture form exists. This is the biggest gap between the pages that exist and the data they need.
- **Price units need a human pass.** Tatu City Apartment (70,000) is probably `per_month`; Karen office space (`price_kes = 125`) is probably 125 `per_sqft` or a typo. Both are one-click fixes in the Listings editor now, but only the user knows the truth.
- **`sale_price_kes` has no UI.** The revenue trend falls back from `sale_price_kes` to `price_kes`, and `sold_at` auto-stamps as today. There is no way yet to record a final negotiated price different from the listing price, or to backdate a sale. Fine for now; wrong the first time a real sale closes at a discount or gets entered late.
- **Custom platform labels are naively title-cased** ("linkedin" renders as "Linkedin"). Cosmetic.
- **KPI deltas still omitted** (carried from Phase 1; needs historical sales-state tracking).
- **No property delete in the app.** Deliberate: `properties` is shared with the running PropIQ app and deletes cascade into analytics history. Revisit only if the user asks.

## 5. Decisions and why

- **Funnel counts are cumulative** (a lead at "offer" counts at "lead" and "viewing" too), computed from the single `stage` column. This is standard funnel semantics and avoids a stage-history table until something needs one.
- **One month-spine endpoint for listings + leads** rather than two: the chart always renders both series together; the spine zero-fills gap months so the axis never lies.
- **Price bands cover sale prices only** (`price_unit = 'total'`). Rents and per-area rates live on different scales; mixing them made the chart meaningless, which is the exact problem `price_unit` was added to fix.
- **Revenue falls back to `price_kes` when `sale_price_kes` is null**, so revenue appears as soon as a property is marked sold, refining automatically if a final price is recorded later.
- **The Listings editor was pulled forward from Phase 5** at the user's request, and grew from status/price editing to full create + rename + social links across three user asks in one session. The roadmap below reflects this.
- **The platform set is open** (`PlatformSlug`, any lowercase slug) instead of a fixed enum. The built-in four keep curated labels and (future) fetchers; anything else renders with fallback label and color. Chosen so adding a platform is a data act, not a schema migration.
- **`platform_links.post_id` is stored as `''`, not guessed from the URL.** Phase 1 established that hand-derived ids (Instagram shortcodes) are wrong for the Graph API. Empty means "unresolved"; Phase 3's fetchers own resolution.
- **New properties mirror `location` into PropIQ's NOT NULL `address` column.** The alternative was adding an address field to the form for a column this app never displays.
- **`sold_at` auto-stamps on the status change** rather than asking for a date, keeping the common case (marking a sale the day it closes) one click.

## 6. Next-phase entry points

- Start with (Phase 3, marketing): create the `posts`, `post_metrics`, and `platform_accounts` tables (confirmed absent from the live DB; create, don't port). Port and fix `instagram.js` (deprecated fields, `views` not `impressions`, wrong endpoint). Use `platform_links` — now user-editable in the app — as the source of which posts belong to which property, and resolve real post ids from the stored URLs.
- Before or alongside: consider a small lead-capture form (name, phone, source, property, stage). Every sales widget built this phase is waiting on lead rows, and the Supabase table editor is the only current path.
- User data tasks, in the app: set the right units for Tatu City and Karen office space, enter any real leads, and mark real sales as they happen.
- The platform trend line chart (owed since Phase 1) becomes possible once Phase 3 starts accumulating `analytics_history` snapshots.
