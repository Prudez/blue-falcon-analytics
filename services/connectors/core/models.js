// core/models.js
// The stable internal shapes every connector must normalize into.
// External APIs rename fields (impressions -> views); portals redesign DOMs.
// That churn is absorbed inside each connector's map step — everything past
// this file only ever sees these shapes. Same principle as the api-contract
// skill, applied to the ingestion side.

const { z } = require('zod');

// A social post as observed on a platform (facebook, instagram, tiktok, x).
const SocialPostModel = z.object({
  platform: z.string().min(1),
  external_id: z.string().min(1), // the platform's own post/media ID
  property_id: z.number().int().nullable().default(null), // FK to properties when known
  posted_at: z.coerce.date().nullable().default(null),
  permalink: z.string().nullable().default(null),
  caption: z.string().nullable().default(null),
  raw: z.record(z.any()).default({}),
});

// Daily metric snapshot for one social post. Upsert key: (post, metric_date).
const SocialMetricModel = z.object({
  platform: z.string().min(1),
  external_id: z.string().min(1),
  metric_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  views: z.number().int().nullable().default(null), // Meta: 'views' (impressions deprecated v22.0)
  reach: z.number().int().nullable().default(null),
  likes: z.number().int().nullable().default(null),
  comments: z.number().int().nullable().default(null),
  shares: z.number().int().nullable().default(null),
  saves: z.number().int().nullable().default(null),
  raw: z.record(z.any()).default({}),
});

// A portal listing as observed in the agent CRM.
const PortalListingModel = z.object({
  portal: z.string().min(1), // buyrentkenya | property24 | kedwell
  external_id: z.string().min(1), // the portal's listing ID from its URL
  property_id: z.number().int().nullable().default(null),
  title: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  raw: z.record(z.any()).default({}),
});

// Daily metric snapshot for one portal listing. Upsert key: (listing, metric_date).
const PortalMetricModel = z.object({
  portal: z.string().min(1),
  external_id: z.string().min(1),
  metric_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  views: z.number().int().nullable().default(null),
  saves: z.number().int().nullable().default(null),
  contact_clicks: z.number().int().nullable().default(null),
  phone_reveals: z.number().int().nullable().default(null),
  whatsapp_clicks: z.number().int().nullable().default(null),
  inquiries: z.number().int().nullable().default(null),
  raw: z.record(z.any()).default({}),
});

// What every connector's fetch() must resolve to.
const FetchResultModel = z.object({
  posts: z.array(SocialPostModel).default([]),
  socialMetrics: z.array(SocialMetricModel).default([]),
  listings: z.array(PortalListingModel).default([]),
  portalMetrics: z.array(PortalMetricModel).default([]),
});

module.exports = {
  SocialPostModel,
  SocialMetricModel,
  PortalListingModel,
  PortalMetricModel,
  FetchResultModel,
};
