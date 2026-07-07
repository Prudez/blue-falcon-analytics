# Phase 4 Handoff

> Repo path: `docs/phases/phase-4.md`. Commit this file. It is the state of record for this phase.
> Companion: the API contract file (`shared/contract.js`) holds the current interface shape. This document references it; it does not duplicate it.

**Phase:** 4
**Date closed:** 2026-07-07
**One-line summary:** All four platforms covered — Facebook by API sync, TikTok/X (and any custom platform) by manual entry — behind one platform-agnostic Marketing page; the leads-by-source attribution view moved to Phase 5.

---

## 1. What shipped

- Fetcher: `server/fetchers/facebook.js` — resolves the Page (and its Page token) from a Facebook-login user token via `/me/accounts`, exchanges the stored token for a long-lived (~60 day) one when `META_APP_ID`/`META_APP_SECRET` are set **and persists it back to `.env`** so the Explorer's 1–2 hour token only has to survive one sync, lists Page posts with engagement counts riding along, and reads `post_impressions`/`post_impressions_unique` insights with graceful degradation to null.
- Sync: `POST /api/marketing/sync/facebook` — same skeleton as Instagram. Facebook links are matched by post id extracted from any URL form (`pfbid...`, `/posts/{id}`, `story_fbid=`); opaque `share/p/` links cannot be matched by design.
- Unified overview: `instagramOverview` became **`marketingOverview`** (`GET /api/marketing/overview`) — an accounts array across platforms, KPIs over all tracked posts, per-platform follower trends, and a platform column in top posts. The Marketing page renders one sync bar per syncable platform.
- Manual entry (TikTok, X, custom platforms): `GET /api/marketing/manual`, `POST /api/marketing/manual/metrics`, `POST /api/marketing/manual/followers`, and a Manual Metrics card on the Marketing page. Hand-entered numbers are `source='manual'` rows in the same `post_metrics`/`account_metrics` tables, so every chart and rollup treats them identically to synced data, and each save is a new time-series capture. Manual posts use their URL as `external_post_id`.
- Shared plumbing: `refreshPropertyRollups(platform, propertyIds)` (analytics_cache + analytics_history refresh, now used by both syncs and manual entry) and the `SYNCED_PLATFORMS` constant separating API-synced platforms from manual ones.
- Fixes shaken out by verification: the engagement rate now only computes over posts that *have* a reach figure (a reach-less manual post inflated it to 183%), and the multi-platform follower trend sorts chronologically before merging (the axis ran backwards when platforms first synced on different days).
- Credential script: `scripts/add-facebook-keys.ps1` (typed App ID, clipboard-read App Secret and token, validation per value).
- Verified live: first Facebook sync pulled the "Blue Falcon Estate Agents" Page, 901 followers; the long-lived token exchange succeeded and persisted. Manual entry verified with a throwaway TikTok link + follower snapshot (cleaned up afterward). Combined dashboard: 1,207 followers across platforms.

## 2. Contract diff

- Replaced: `instagramOverview` → `marketingOverview` (accounts array, `followerTrends` per platform, `platform` on top posts).
- Added: `syncFacebook`, `manualEntryState`, `recordManualMetrics`, `recordManualFollowers`.

## 3. Environment state

- `.env` gained `FB_ACCESS_TOKEN` (long-lived after first sync's exchange), `META_APP_ID=1564314185307543`, `META_APP_SECRET`, and optional `FB_PAGE_ID` (unset; the account manages one Page). All declared in `.env.example`, validated optionally in `env.js`.
- The Facebook token was generated in Graph API Explorer with `pages_show_list` + `pages_read_engagement` (the app's use case exposes only those two plus `business_management`; `read_insights` was NOT obtainable in the Explorer's list — see open issues).
- The server rewrites `FB_ACCESS_TOKEN` in `.env` after a successful exchange (`persistEnvValue` in `server/index.js`).
- Platform accounts at close: instagram (@bluefalcon_estateagents, 306), facebook (Blue Falcon Estate Agents, 901).

## 4. Open issues / known-broken

- **Facebook reach/impressions are unverified.** No Facebook post has been linked and synced yet, and the token lacks `read_insights`. Likes/comments/shares will work regardless; if reach comes back null on the first real sync, add `read_insights` via Use cases → Manage everything on your Page → Customize → its Add button, regenerate the token, re-run `add-facebook-keys.ps1` (or `token-from-clipboard` won't work here — it writes the Instagram key; use the facebook script).
- **Facebook `share/p/...` links cannot be matched** (opaque ids). Users must paste the post's full URL. The Listings page does not warn about this yet.
- **Both platform tokens expire around early September 2026** (~60 days). Renewal: Instagram — dashboard Generate token + `token-from-clipboard.ps1`; Facebook — Explorer token + `add-facebook-keys.ps1` (the exchange re-extends it). Nothing warns proactively; the sync buttons will start returning auth errors.
- **The roadmap's cross-platform attribution did not ship here:** leads-by-source tying platforms to the sales leads they produce, and the `property_platform_performance` view, moved to Phase 5. The data for it exists (leads.source, posts, post_metrics).
- `analytics_cache.clicks` is always written as 0; nothing measures link clicks yet.
- TikTok API sync remains possible later (requires switching the TikTok account to Business and registering a TikTok developer app); X API access is paywalled and manual entry is the standing answer.

## 5. Decisions and why

- **Manual and synced metrics share one schema**, distinguished only by `source`. PropIQ's design doc called this out explicitly; it means dashboards never care where a number came from, and a future TikTok API migration needs no data movement.
- **The token exchange persists to `.env`.** The alternative was asking the user to mint long-lived tokens by hand every time; after the credential-entry saga of Phase 3, one-time short-token entry with automatic extension was the only humane option.
- **Facebook links match on extracted post ids** (pfbid/story_fbid/numeric) rather than whole URLs, because Facebook URL forms vary wildly for the same post.
- **The engagement-rate denominator excludes reach-less posts.** Mixing platforms means mixing data completeness; a rate computed over posts that actually have reach is honest, if narrower.
- **X gets no API integration.** Costed at $100+/month for useful metrics; manual entry covers the need at this scale.

## 6. Next-phase entry points

- Start with (Phase 5): **leads-by-source attribution** — the payoff feature. `leads.source` + per-platform metrics already exist; a widget tying "posts on platform X" to "leads from platform X" per property closes the loop the brief promised. Create the `property_platform_performance` view (or its query equivalent) here.
- Then polish: global date-range filter and Export (the two inert header buttons), per-widget drill-down, loading/empty states, KPI deltas (still owed from Phase 1), and possibly a scheduled auto-sync so the buttons press themselves.
- User data tasks: link Facebook post URLs (full `/posts/` form) to listings and sync; enter TikTok/X numbers in the Manual Metrics card; keep syncing every few days so trends accumulate.
