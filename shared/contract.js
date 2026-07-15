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
// "twitter" is the storage name for X. These four have fetchers and first-
// class labels; PlatformSlug below is the open set for everything else.
export const SocialPlatform = z.enum(["facebook", "instagram", "tiktok", "twitter"]);

// Any platform name, including user-added ones (linkedin, youtube, ...).
// Lowercase slug, matching how PropIQ stores the built-in four.
export const PlatformSlug = z
  .string()
  .regex(/^[a-z0-9_]{2,30}$/, "Platform must be a lowercase slug (letters, digits, underscores).");

// One social post tied to a property. post_id exists in the table but is
// resolved by the Phase 3 fetchers, not entered by hand, so it is not part
// of the interface.
export const PlatformLink = z.object({
  id: z.number().int(),
  propertyId: z.number().int(),
  platform: PlatformSlug,
  postUrl: z.string().url(),
  linkedAt: z.string().datetime(),
});

// Funnel order matters: each lead sits at exactly one stage, and the funnel
// endpoint reports cumulative counts (a lead at "offer" has passed "viewing").
// Matches the CHECK constraint on propiq.leads.stage (migration 002); change
// both together or neither.
export const LeadStage = z.enum(["lead", "viewing", "offer", "closed"]);

// Where a lead came from. Matches the CHECK constraint on
// propiq.leads.source (migration 001); change both together or neither.
export const LeadSource = z.enum([
  "facebook",
  "instagram",
  "tiktok",
  "twitter",
  "walk_in",
  "other",
]);

// What price_kes means for a listing: a sale total, a monthly rent, or a
// rate. Matches the CHECK constraint on propiq.properties.price_unit
// (migration 003); change both together or neither.
export const PriceUnit = z.enum(["total", "per_month", "per_sqft", "per_acre"]);

// One editable listing row, as the Listings page sees it. soldAt is a plain
// date (YYYY-MM-DD), stamped automatically when status becomes "sold".
export const Property = z.object({
  id: z.number().int(),
  name: z.string(),
  location: z.string().nullable(),
  status: ListingStatus,
  priceKes: z.number().int().nonnegative().nullable(),
  priceUnit: PriceUnit,
  soldAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  createdAt: z.string().datetime(),
});

// Price bands for the listings breakdown. Labels are shared here so the
// backend buckets and the frontend legend can never disagree. Only sale
// prices (price_unit = 'total') are banded; rents and rates are different
// scales and would make the buckets meaningless. "Unpriced" catches NULL
// price_kes.
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

  // Whether a login is required (APP_PASSWORD set server-side) and whether
  // this client's token currently passes. Open endpoint: the client needs
  // it to decide whether to show the login screen.
  authStatus: {
    method: "GET",
    path: "/api/auth/status",
    request: z.object({}),
    response: z.object({
      required: z.boolean(),
      authenticated: z.boolean(),
    }),
  },

  // Trade the password for a signed token (~30 days). Every other endpoint
  // except health and auth requires it as `Authorization: Bearer <token>`
  // when auth is enabled.
  login: {
    method: "POST",
    path: "/api/auth/login",
    request: z.object({
      password: z.string().min(1, "Enter the password."),
    }),
    response: z.object({
      token: z.string(),
      expiresAt: z.string().datetime(),
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
          platform: PlatformSlug,
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

  // All listings for the Listings editor, newest first.
  listProperties: {
    method: "GET",
    path: "/api/properties",
    request: z.object({}),
    response: z.object({
      properties: z.array(Property),
    }),
  },

  // Create a listing from the Listings page. Status starts as "available";
  // everything except the name can be filled in later.
  createProperty: {
    method: "POST",
    path: "/api/properties",
    request: z.object({
      name: z.string().min(1, "A property name is required."),
      location: z.string().optional(),
      priceKes: z.number().int().nonnegative().nullable().optional(),
      priceUnit: PriceUnit.optional(),
    }),
    response: Property,
  },

  // Edit a listing from the Listings page. Send only the fields being
  // changed; at least one is required. Setting status to "sold" stamps
  // sold_at with today's date (if not already set); any other status clears
  // it. Returns the full updated row.
  updateProperty: {
    method: "PATCH",
    path: "/api/properties/:id",
    request: z
      .object({
        name: z.string().min(1).optional(),
        location: z.string().nullable().optional(),
        status: ListingStatus.optional(),
        priceKes: z.number().int().nonnegative().nullable().optional(),
        priceUnit: PriceUnit.optional(),
      })
      .refine((body) => Object.keys(body).length > 0, {
        message: "At least one field is required.",
      }),
    response: Property,
  },

  // Every property→post link, for the Listings page's social editor. The
  // client groups them by propertyId.
  listPlatformLinks: {
    method: "GET",
    path: "/api/platform-links",
    request: z.object({}),
    response: z.object({
      links: z.array(PlatformLink),
    }),
  },

  // Tie a social post to a property by URL. The platform can be any slug,
  // not just the built-in four; analytics for it arrive when a fetcher
  // exists (Phase 3+).
  addPlatformLink: {
    method: "POST",
    path: "/api/platform-links",
    request: z.object({
      propertyId: z.number().int(),
      platform: PlatformSlug,
      postUrl: z.string().url("The post link must be a full URL, starting with https://"),
    }),
    response: PlatformLink,
  },

  deletePlatformLink: {
    method: "DELETE",
    path: "/api/platform-links/:id",
    request: z.object({}),
    response: z.object({
      deleted: z.literal(true),
    }),
  },

  // Capture a lead from the Sales page. Stage defaults to the top of the
  // funnel. Returns the same row shape recentLeads uses.
  createLead: {
    method: "POST",
    path: "/api/leads",
    request: z.object({
      name: z.string().min(1, "The lead needs a name."),
      phone: z.string().optional(),
      propertyId: z.number().int().nullable().optional(),
      source: LeadSource,
      stage: LeadStage.optional(),
    }),
    response: z.object({
      id: z.number().int(),
      name: z.string(),
      phone: z.string().nullable(),
      propertyName: z.string().nullable(),
      source: z.string(),
      stage: LeadStage,
      createdAt: z.string().datetime(),
    }),
  },

  // Everything the Marketing page renders, in one call, across all synced
  // platforms. `accounts` is empty until the first successful sync. Post
  // metrics come from the LATEST capture per post; engagementRate is
  // engagement/reach (null when reach is 0).
  marketingOverview: {
    method: "GET",
    path: "/api/marketing/overview",
    request: z.object({}),
    response: z.object({
      accounts: z.array(
        z.object({
          platform: PlatformSlug,
          handle: z.string(),
          followers: z.number().int().nullable(),
          mediaCount: z.number().int().nullable(),
          lastSyncedAt: z.string().datetime().nullable(),
        })
      ),
      kpis: z.object({
        reach: z.number().int().nonnegative(),
        engagement: z.number().int().nonnegative(),
        engagementRate: z.number().nullable(),
        postsTracked: z.number().int().nonnegative(),
      }),
      followerTrends: z.array(
        z.object({
          platform: PlatformSlug,
          points: z.array(
            z.object({
              capturedAt: z.string().datetime(),
              followers: z.number().int().nullable(),
            })
          ),
        })
      ),
      topPosts: z.array(
        z.object({
          postId: z.number().int(),
          platform: PlatformSlug,
          propertyName: z.string(),
          caption: z.string().nullable(),
          permalink: z.string().nullable(),
          publishedAt: z.string().datetime().nullable(),
          reach: z.number().int().nullable(),
          views: z.number().int().nullable(),
          likes: z.number().int().nullable(),
          comments: z.number().int().nullable(),
          engagement: z.number().int().nonnegative(),
        })
      ),
    }),
  },

  // Both sync endpoints report the same shape: the account that was
  // synced, how many linked posts matched the platform's own post list,
  // and how many links found no match (wrong URL form or another
  // account's post).
  syncInstagram: {
    method: "POST",
    path: "/api/marketing/sync/instagram",
    request: z.object({}),
    response: z.object({
      account: z.object({
        handle: z.string(),
        followers: z.number().int().nullable(),
        mediaCount: z.number().int().nullable(),
      }),
      postsMatched: z.number().int().nonnegative(),
      metricsCaptured: z.number().int().nonnegative(),
      linksUnmatched: z.number().int().nonnegative(),
    }),
  },

  // Facebook Page sync, same pattern as Instagram: resolves the Page from
  // FB_ACCESS_TOKEN (exchanging it for a long-lived token when
  // META_APP_ID/META_APP_SECRET are set), matches the Page's posts against
  // platform_links, and stores a metrics capture per match.
  syncFacebook: {
    method: "POST",
    path: "/api/marketing/sync/facebook",
    request: z.object({}),
    response: z.object({
      account: z.object({
        handle: z.string(),
        followers: z.number().int().nullable(),
        mediaCount: z.number().int().nullable(),
      }),
      postsMatched: z.number().int().nonnegative(),
      metricsCaptured: z.number().int().nonnegative(),
      linksUnmatched: z.number().int().nonnegative(),
    }),
  },

  // Portal-sync manual trigger (sync-integration workstream, Phase A).
  // Runs one pass across every registered property portal and returns the
  // per-portal outcome that landed in portal_sync_runs. A portal with no
  // credentials is reported as "skipped", not an error; a fetcher failure
  // is "error" with a message and does not stop the other portals. Auth is
  // enforced by the /api gate, same as the other sync routes.
  portalSyncRun: {
    method: "POST",
    path: "/api/portal-sync/run",
    request: z.object({}),
    response: z.object({
      runs: z.array(
        z.object({
          portal: z.string(),
          status: z.enum(["ok", "skipped", "error"]),
          listings: z.number().int().nonnegative().nullable(),
          error: z.string().nullable(),
        })
      ),
    }),
  },

  // Manual-entry state for platforms without an API sync (TikTok, X, and
  // custom platforms): every linked post with its latest recorded numbers,
  // and the manually-tracked accounts. Instagram/Facebook are excluded —
  // their sync owns their numbers.
  manualEntryState: {
    method: "GET",
    path: "/api/marketing/manual",
    request: z.object({}),
    response: z.object({
      entries: z.array(
        z.object({
          linkId: z.number().int(),
          platform: PlatformSlug,
          propertyName: z.string(),
          postUrl: z.string(),
          latest: z
            .object({
              capturedAt: z.string().datetime(),
              views: z.number().int().nullable(),
              reach: z.number().int().nullable(),
              likes: z.number().int().nullable(),
              comments: z.number().int().nullable(),
              shares: z.number().int().nullable(),
            })
            .nullable(),
        })
      ),
      accounts: z.array(
        z.object({
          platform: PlatformSlug,
          handle: z.string(),
          followers: z.number().int().nullable(),
          lastUpdatedAt: z.string().datetime().nullable(),
        })
      ),
    }),
  },

  // Record a metrics capture for a manually-tracked post. Each save adds a
  // new time-series row (source='manual'), exactly like a sync capture, so
  // trends accumulate. At least one number is required.
  recordManualMetrics: {
    method: "POST",
    path: "/api/marketing/manual/metrics",
    request: z
      .object({
        linkId: z.number().int(),
        views: z.number().int().nonnegative().nullable().optional(),
        reach: z.number().int().nonnegative().nullable().optional(),
        likes: z.number().int().nonnegative().nullable().optional(),
        comments: z.number().int().nonnegative().nullable().optional(),
        shares: z.number().int().nonnegative().nullable().optional(),
      })
      .refine(
        (b) => ["views", "reach", "likes", "comments", "shares"].some((k) => b[k] != null),
        { message: "Enter at least one number." }
      ),
    response: z.object({
      linkId: z.number().int(),
      platform: PlatformSlug,
      propertyName: z.string(),
      postUrl: z.string(),
      latest: z.object({
        capturedAt: z.string().datetime(),
        views: z.number().int().nullable(),
        reach: z.number().int().nullable(),
        likes: z.number().int().nullable(),
        comments: z.number().int().nullable(),
        shares: z.number().int().nullable(),
      }),
    }),
  },

  // Record a follower count for a manually-tracked account (creates the
  // account row on first use). Snapshots accumulate into the same
  // follower-trend series the synced platforms use.
  recordManualFollowers: {
    method: "POST",
    path: "/api/marketing/manual/followers",
    request: z.object({
      platform: PlatformSlug,
      handle: z.string().min(1, "The account needs a handle."),
      followers: z.number().int().nonnegative(),
    }),
    response: z.object({
      platform: PlatformSlug,
      handle: z.string(),
      followers: z.number().int(),
      lastUpdatedAt: z.string().datetime(),
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
