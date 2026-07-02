# Project Brief

> Repo path: `docs/phases/README.md`. Commit this file. It is the standing brief for the whole project.
> A fresh chat reads this first, then the latest `docs/phases/phase-N.md`, then `shared/contract.js`, and continues with no re-briefing.

## What this app is

A marketing and sales analytics dashboard for Blue Falcon Real Estate (working title: Blue Falcon Analytics, rename as preferred). It presents one card-grid dashboard drawing from two data worlds: internal sales data (listings, leads, closings) and social marketing data (reach, engagement, and top posts across Facebook, Instagram, TikTok, and X). The payoff feature is tying marketing activity on a platform back to the sales leads it produced, which a generic BI tool does not do.

This is a fresh app. It does not rebuild PropIQ. It reads PropIQ's existing Supabase database and reuses its schema and platform fetchers, so no data collection is rebuilt. The frontend and thin API are new; the data foundation is inherited.

## Stack and conventions

- Backend: Node/Express on port 3001.
- Frontend: Vite/React on port 3000. Card-grid dashboard, deep-navy brand, Recharts for charts. The geographic widget is a Kenya/county or Nairobi-area map, not a US map.
- Database: the existing PropIQ Supabase/Postgres project, `propiq` schema, via the Transaction pooler on port 6543.
- Conventions: `$1` positional params, schema-prefixed tables (`propiq.`), async DB helpers, `VITE_API_URL` for the frontend, PowerShell on Windows. Zombie Node processes clear with `taskkill /F /IM node.exe`.
- Interface source of truth: `shared/contract.js` (api-contract skill). Both sides import it; neither defines shapes independently.
- Secrets: managed via the api-keys skill (`.env.example` plus a startup validator). Reuse the existing Meta "PropIQ Sync" app; do not re-register it.

## Data foundation and what we reuse from PropIQ

Reused as-is (ported, not rewritten):

- Schema: `properties`, `platform_links`, `analytics_cache`, `analytics_history`, `buyrent_manual_stats`, plus the social tables `platform_accounts`, `posts`, `post_metrics`, `leads`, and the `property_platform_performance` view.
- The node-postgres connection setup (pooler on 6543, `$1` params, `propiq.` prefixes).
- The four platform fetcher files (facebook, instagram, tiktok, twitter), which are pure axios and have no DB coupling.
- The Meta "PropIQ Sync" developer app.

Fix during the port, do not inherit: `instagram.js` has known correctness issues (deprecated field names, wrong endpoint, and stored URL shortcodes that do not map to the numeric media IDs the Graph API requires). Instagram uses `views`, not the deprecated `impressions`. TikTok Personal accounts cannot access `video.insights`; a Business account is required for that data.

## How this project is built (the working method)

This section is stable. It rarely changes between phases.

- The app is built in phases. Each phase ships a coherent slice of working functionality.
- Every phase closes with a handoff at `docs/phases/phase-N.md`: what shipped, contract diff, environment state, open issues, decisions, next-phase entry points.
- The `shared/contract.js` file is the single source of truth for the interface. Shapes are defined there first, then the backend validates against it and the frontend consumes it.
- Each dashboard widget is added the same way: contract entry, then backend query, then frontend card. The base must be solid before widgets stack on it.
- Open issues are never carried in memory. If a phase leaves something broken, it lives in that phase's open-issues section until closed.

## Phase roadmap

- [x] **Phase 0 — Walking skeleton.** Scaffold the repo, both servers talking, connect to the existing PropIQ Supabase, create `shared/contract.js` with a single `GET /api/health` entry that hits the DB, set up env via the api-keys skill with the startup validator, and render the health check end to end. Commit this brief. No features. The goal is a known-good, aligned base. See `docs/phases/phase-0.md`. Live DB connectivity, left open at close, was verified at the start of Phase 1.
- [x] **Phase 1 — Dashboard shell and first KPI cards.** Build the navy card-grid layout and nav. Populate the top row from internal data only: active listings, under offer, sold, leads captured. Add a listings-by-status donut and a listings-by-location breakdown. No external APIs yet. See `docs/phases/phase-1.md`: shipped end to end, but the live DB lacked the sales columns and `leads` table the brief assumed, so migration 001 added them additively. Statuses and locations still need backfilling by hand.
- [ ] **Phase 2 — Sales analytics depth.** Listings and leads over time, the lead funnel (lead to viewing to offer to closed), commission or revenue trend, price-band and location breakdowns, and a recent-leads table. Reuse the property and lead schema.
- [ ] **Phase 3 — Marketing, one platform end to end.** Instagram/Meta first. Fetch, store into `posts` and `post_metrics`, and surface reach, engagement rate, top posts, and follower trend. Fix the `instagram.js` issues here. Prove the pattern once. Correction from Phase 1: `posts`, `post_metrics`, and `platform_accounts` do not exist in the live DB and must be created here, not ported.
- [ ] **Phase 4 — Remaining platforms and the unified view.** Add Facebook, TikTok, and X behind the same pattern. Cross-platform rollups and leads-by-source that tie a marketing platform back to sales leads. The `property_platform_performance` view does not exist in the live DB either; create it here.
- [ ] **Phase 5 — Polish.** Global date-range filter, per-widget drill-down, PDF export, loading and empty states, and auth if the app goes beyond single-user.

Out of scope for v1: website SEO (Semrush-style) analytics. Revisit as a separate data domain later.

Mark phases done as they close. Add or re-order upcoming phases when the plan shifts.

## Resume protocol

To continue this project in any new chat:

1. Read this brief.
2. Read the latest `docs/phases/phase-N.md`.
3. Read `shared/contract.js`.
4. Surface any open issues from the latest phase first.
5. Start the next unchecked phase in the roadmap, unless the open issues should be closed first.

A new chat following these steps needs no further instruction.