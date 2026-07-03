// shared/contract.js
//
// Single source of truth for the API surface. Both the backend and the
// frontend import from this file. The backend validates its responses
// against these schemas at the boundary; the frontend derives its checks
// from the same schemas. Neither side defines a shape independently.
//
// Add a new endpoint by adding an entry here first, then wiring the route
// and the fetch call to it.

import { z } from "zod";

// ---- Shared shapes ---------------------------------------------------

// Reused across every failing route, so the frontend can handle errors
// generically instead of per-endpoint.
export const ErrorResponse = z.object({
  error: z.string(),
  message: z.string(),
});

// Listing lifecycle. Matches the CHECK constraint on propiq.properties.status
// (migration 001); change both together or neither.
export const ListingStatus = z.enum(["available", "under_offer", "sold"]);

// Platform names as PropIQ stores them in analytics_cache.platform.
// "twitter" is the storage name for X.
export const SocialPlatform = z.enum(["facebook", "instagram", "tiktok", "twitter"]);

// Funnel order matters: each lead sits at exactly one stage, and the funnel
// endpoint reports cumulative counts (a lead at "offer" has passed "viewing").
// Matches the CHECK constraint on propiq.leads.stage (migration 002); change
// both together or neither.
export const LeadStage = z.enum(["lead", "viewing", "offer", "closed"]);

// Price bands for the listings breakdown. Labels are shared here so the
// backend buckets and the frontend legend can never disagree. "Unpriced"
// catches NULL price_kes.
export const PriceBand = z.enum([
  "Under 100K",
  "100K–1M",
  "1M–10M",
  "10M–50M",
  "50M+",
  "Unpriced",
]);

// ---- Endpoints ---------------------------------------------------------

export const contract = {
  health: {
    method: "GET",
    path: "/api/health",
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      timestamp: z.string().datetime(),
    }),
  },

  // Overview top row: one call, all four numbers.
  kpiSummary: {
    method: "GET",
    path: "/api/kpis/summary",
    request: z.object({}),
    response: z.object({
      activeListings: z.number().int().nonnegative(),
      underOffer: z.number().int().nonnegative(),
      sold: z.number().int().nonnegative(),
      leadsCaptured: z.number().int().nonnegative(),
    }),
  },

  // Donut widget. Every status appears exactly once, zero-count included,
  // so the chart legend is stable regardless of the data.
  listingsByStatus: {
    method: "GET",
    path: "/api/listings/by-status",
    request: z.object({}),
    response: z.object({
      breakdown: z.array(
        z.object({
          status: ListingStatus,
          count: z.number().int().nonnegative(),
        })
      ),
    }),
  },

  // Overview comparison card: how each platform performed per property,
  // read from PropIQ's analytics_cache. Only properties with cached platform
  // metrics appear. `asOf` is the newest fetched_at in the cache (null when
  // the cache is empty) — the numbers are PropIQ's last fetch, not live.
  // `engagement` is computed server-side as likes + comments + shares + clicks.
  platformPerformance: {
    method: "GET",
    path: "/api/marketing/platform-performance",
    request: z.object({}),
    response: z.object({
      asOf: z.string().datetime().nullable(),
      rows: z.array(
        z.object({
          propertyId: z.number().int(),
          propertyName: z.string(),
          platform: SocialPlatform,
          impressions: z.number().int().nonnegative(),
          reach: z.number().int().nonnegative(),
          likes: z.number().int().nonnegative(),
          comments: z.number().int().nonnegative(),
          shares: z.number().int().nonnegative(),
          clicks: z.number().int().nonnegative(),
          engagement: z.number().int().nonnegative(),
        })
      ),
    }),
  },

  // Sales page trend: new listings and new leads per month, one series each.
  // Months are zero-filled from the earliest record to the current month, so
  // the axis never skips a gap month.
  salesOverTime: {
    method: "GET",
    path: "/api/sales/over-time",
    request: z.object({}),
    response: z.object({
      points: z.array(
        z.object({
          month: z.string().regex(/^\d{4}-\d{2}$/),
          listings: z.number().int().nonnegative(),
          leads: z.number().int().nonnegative(),
        })
      ),
    }),
  },

  // Lead funnel. Counts are CUMULATIVE: each stage counts leads at that stage
  // or any later one, so the funnel is monotonically non-increasing. Every
  // stage is emitted, zero-count included, in funnel order.
  leadFunnel: {
    method: "GET",
    path: "/api/sales/lead-funnel",
    request: z.object({}),
    response: z.object({
      stages: z.array(
        z.object({
          stage: LeadStage,
          count: z.number().int().nonnegative(),
        })
      ),
    }),
  },

  // Revenue trend: monthly sum over sold properties with a sold_at date.
  // Uses sale_price_kes, falling back to the listing price_kes when the
  // final price was not recorded. Only months with revenue appear.
  revenueTrend: {
    method: "GET",
    path: "/api/sales/revenue-trend",
    request: z.object({}),
    response: z.object({
      points: z.array(
        z.object({
          month: z.string().regex(/^\d{4}-\d{2}$/),
          revenueKes: z.number().nonnegative(),
        })
      ),
    }),
  },

  // Listings bucketed by price band. Every band is emitted, zero-count
  // included, in the PriceBand order, so the chart axis is stable.
  priceBands: {
    method: "GET",
    path: "/api/sales/price-bands",
    request: z.object({}),
    response: z.object({
      bands: z.array(
        z.object({
          band: PriceBand,
          count: z.number().int().nonnegative(),
        })
      ),
    }),
  },

  // Latest leads for the Sales table, newest first, capped at 10.
  // propertyName is null for leads not tied to a property.
  recentLeads: {
    method: "GET",
    path: "/api/sales/recent-leads",
    request: z.object({}),
    response: z.object({
      leads: z.array(
        z.object({
          id: z.number().int(),
          name: z.string(),
          phone: z.string().nullable(),
          propertyName: z.string().nullable(),
          source: z.string(),
          stage: LeadStage,
          createdAt: z.string().datetime(),
        })
      ),
    }),
  },

  // Location breakdown widget. Properties with no location yet are grouped
  // under the literal label "Unspecified" by the backend.
  listingsByLocation: {
    method: "GET",
    path: "/api/listings/by-location",
    request: z.object({}),
    response: z.object({
      breakdown: z.array(
        z.object({
          location: z.string(),
          count: z.number().int().nonnegative(),
        })
      ),
    }),
  },
};
