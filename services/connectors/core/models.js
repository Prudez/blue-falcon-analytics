// core/models.js
// The stable internal shapes every connector must normalize into.
// External APIs rename fields (impressions -> views); portals redesign DOMs.
// That churn is absorbed inside each connector's map step — everything past
// this file only ever sees these shapes. Same principle as the api-contract
// skill, applied to the ingestion side.
//
// M2 rewrite: these shapes now mirror the LIVE tables (migrations 004, 005,
// 007), not the skill skeleton's assumed schema. Two live facts drive the
// design:
//   1. propiq.posts.property_id is NOT NULL. A post that cannot be tied to a
//      property cannot be stored. Connectors therefore do the matching
//      (platform_links -> property_id) and only emit matched posts.
//   2. propiq.post_metrics is an append-per-capture time series keyed by
//      captured_at (DEFAULT now()), with no daily unique constraint. There is
//      no metric_date; a sync appends a snapshot, same as the manual routes.
//      Portal metrics differ deliberately: they upsert on a per-UTC-day
//      unique index because scrapers re-run more often (migration 005).

const { z } = require('zod');

// A platform account snapshot (page / IG business account). Upsert key in the
// live schema: (platform, handle). followers/media_count, when present, land
// as an account_metrics time-series row.
const AccountModel = z.object({
  platform: z.string().min(1),
  handle: z.string().min(1),
  external_id: z.string().nullable().default(null),
  followers: z.number().int().nullable().default(null),
  media_count: z.number().int().nullable().default(null),
});

// A social post as observed on a platform, already matched to a property.
// external_id is the platform's own post/media id -> posts.external_post_id.
// account_handle ties the post to an account emitted in the same batch, so
// persistence can fill posts.platform_account_id.
const SocialPostModel = z.object({
  platform: z.string().min(1),
  external_id: z.string().min(1),
  property_id: z.number().int().nullable().default(null),
  account_handle: z.string().nullable().default(null),
  posted_at: z.coerce.date().nullable().default(null),
  permalink: z.string().nullable().default(null),
  caption: z.string().nullable().default(null),
  media_type: z.string().nullable().default(null),
  raw: z.record(z.string(), z.any()).default({}),
});

// One metrics capture for one social post. Appended, never upserted:
// captured_at defaults to now() in the live table. `raw` is carried for
// connector-internal use and is NOT persisted (posts/post_metrics have no
// raw column — API syncs have no selectors to snapshot).
const SocialMetricModel = z.object({
  platform: z.string().min(1),
  external_id: z.string().min(1),
  reach: z.number().int().nullable().default(null),
  views: z.number().int().nullable().default(null), // Meta: 'views'; 'impressions' deprecated v22.0
  likes: z.number().int().nullable().default(null),
  comments: z.number().int().nullable().default(null),
  shares: z.number().int().nullable().default(null),
  saves: z.number().int().nullable().default(null),
  total_interactions: z.number().int().nullable().default(null),
  source: z.enum(['api', 'manual']).default('api'),
  raw: z.record(z.string(), z.any()).default({}),
});

// A portal listing as observed in the agent CRM. Live table: portal_listings
// (portal_id, external_id unique; status yes, raw no — migration 005).
const PortalListingModel = z.object({
  portal: z.string().min(1), // portals.code: buyrentkenya | property24 | kedwell
  external_id: z.string().min(1),
  property_id: z.number().int().nullable().default(null),
  title: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  status: z.string().nullable().default(null),
});

// One metrics capture for one portal listing. Upserts on 005's per-UTC-day
// expression index (portal_listing_metrics_daily_uq). `raw` IS persisted here
// (migration 007): scrapers store the last-seen snapshot for selector diffing.
const PortalMetricModel = z.object({
  portal: z.string().min(1),
  external_id: z.string().min(1),
  views: z.number().int().nullable().default(null),
  saves: z.number().int().nullable().default(null),
  contact_clicks: z.number().int().nullable().default(null),
  phone_reveals: z.number().int().nullable().default(null),
  whatsapp_clicks: z.number().int().nullable().default(null),
  inquiries: z.number().int().nullable().default(null),
  source: z.enum(['scrape', 'manual', 'import']).default('scrape'),
  raw: z.record(z.string(), z.any()).nullable().default(null),
});

// What every connector's run() must resolve to.
const FetchResultModel = z.object({
  accounts: z.array(AccountModel).default([]),
  posts: z.array(SocialPostModel).default([]),
  socialMetrics: z.array(SocialMetricModel).default([]),
  listings: z.array(PortalListingModel).default([]),
  portalMetrics: z.array(PortalMetricModel).default([]),
});

module.exports = {
  AccountModel,
  SocialPostModel,
  SocialMetricModel,
  PortalListingModel,
  PortalMetricModel,
  FetchResultModel,
};
