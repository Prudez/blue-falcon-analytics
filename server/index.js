// server/index.js
//
// Express entry point. Routes validate their responses against
// shared/contract.js before sending, so a shape drift fails loudly here
// instead of silently on the client.

import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { query } from "./db.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchAccount,
  fetchMedia,
  fetchInsights,
  permalinkCode,
  isInstagramLoginToken,
} from "./fetchers/instagram.js";
import {
  exchangeForLongLivedToken,
  resolvePage,
  fetchPagePosts,
  fetchPostInsights,
  facebookPostKey,
  facebookApiPostKeys,
} from "./fetchers/facebook.js";
import { authEnabled, checkPassword, issueToken, verifyToken } from "./auth.js";
import {
  contract,
  ErrorResponse,
  ListingStatus,
  LeadStage,
  PriceBand,
} from "../shared/contract.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get(contract.health.path, async (req, res) => {
  try {
    const result = await query("SELECT NOW() AS now");
    const body = contract.health.response.parse({
      ok: true,
      timestamp: result.rows[0].now.toISOString(),
    });
    res.json(body);
  } catch (err) {
    console.error("GET /api/health failed:", err.message);
    const body = ErrorResponse.parse({
      error: "health_check_failed",
      message: "Could not reach the database.",
    });
    res.status(503).json(body);
  }
});

// Wraps a route so every failure returns the contract's error shape with a
// stable machine-readable code, and success bodies are validated against the
// endpoint's response schema before they leave the process. Non-GET requests
// have their body validated against the endpoint's request schema first; a
// bad body is the client's fault and returns 400, not 503.
function contractRoute(endpoint, errorCode, handler) {
  const method = endpoint.method.toLowerCase();
  app[method](endpoint.path, async (req, res) => {
    let input = {};
    if (method !== "get") {
      const parsed = endpoint.request.safeParse(req.body);
      if (!parsed.success) {
        const body = ErrorResponse.parse({
          error: "invalid_request",
          message: parsed.error.issues.map((i) => i.message).join("; "),
        });
        return res.status(400).json(body);
      }
      input = parsed.data;
    }
    try {
      const body = endpoint.response.parse(await handler(req, input));
      res.json(body);
    } catch (err) {
      console.error(`${endpoint.method} ${endpoint.path} failed:`, err.message);
      const body = ErrorResponse.parse({
        error: errorCode,
        // Errors thrown via httpError carry a message written for the user;
        // everything else stays generic so internals never leak.
        message: err.expose ? err.message : "Query failed. Check the server log.",
      });
      res.status(err.expose ? (err.status ?? 503) : 503).json(body);
    }
  });
}

// An error whose message is safe and useful to show the user.
function httpError(status, message) {
  const err = new Error(message);
  err.expose = true;
  err.status = status;
  return err;
}

function bearerToken(req) {
  return (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
}

contractRoute(contract.authStatus, "auth_status_failed", async (req) => ({
  required: authEnabled(),
  authenticated: !authEnabled() || verifyToken(bearerToken(req)),
}));

contractRoute(contract.login, "login_failed", async (req, input) => {
  if (!authEnabled()) {
    throw httpError(400, "No password is configured; login is not required.");
  }
  if (!checkPassword(input.password)) {
    throw httpError(401, "Wrong password.");
  }
  return issueToken();
});

// The gate. Registered AFTER health and the auth endpoints (Express runs
// middleware in registration order), so those stay reachable; everything
// registered below requires a valid token whenever a password is set.
app.use("/api", (req, res, next) => {
  if (!authEnabled()) return next();
  if (verifyToken(bearerToken(req))) return next();
  const body = ErrorResponse.parse({
    error: "unauthorized",
    message: "Sign in to continue.",
  });
  res.status(401).json(body);
});

// Maps a properties row to the contract's Property shape.
function toProperty(r) {
  return {
    id: r.id,
    name: r.name,
    location: r.location,
    status: r.status,
    priceKes: r.price_kes === null ? null : Number(r.price_kes),
    priceUnit: r.price_unit,
    soldAt: r.sold_at ? r.sold_at.toISOString().slice(0, 10) : null,
    createdAt: r.created_at.toISOString(),
  };
}

const PROPERTY_COLUMNS =
  "id, name, location, status, price_kes, price_unit, sold_at, created_at";

contractRoute(contract.listProperties, "list_properties_failed", async () => {
  const result = await query(
    `SELECT ${PROPERTY_COLUMNS} FROM propiq.properties ORDER BY created_at DESC, id DESC`
  );
  return { properties: result.rows.map(toProperty) };
});

contractRoute(contract.createProperty, "create_property_failed", async (req, input) => {
  // PropIQ's schema requires address; this app captures location, so the
  // location doubles as the address until one is edited in PropIQ.
  const result = await query(
    `INSERT INTO propiq.properties (name, address, location, price_kes, price_unit)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PROPERTY_COLUMNS}`,
    [
      input.name,
      input.location ?? "",
      input.location ?? null,
      input.priceKes ?? null,
      input.priceUnit ?? "total",
    ]
  );
  return toProperty(result.rows[0]);
});

contractRoute(contract.updateProperty, "update_property_failed", async (req, input) => {
  const sets = [];
  const params = [];
  if (input.name !== undefined) {
    params.push(input.name);
    sets.push(`name = $${params.length}`);
  }
  if (input.location !== undefined) {
    params.push(input.location);
    sets.push(`location = $${params.length}`);
  }
  if (input.status !== undefined) {
    params.push(input.status);
    sets.push(`status = $${params.length}`);
    // Sold listings get a close date automatically; leaving "sold" clears it
    // so the revenue trend never counts an unsold property.
    sets.push(
      input.status === "sold" ? "sold_at = COALESCE(sold_at, CURRENT_DATE)" : "sold_at = NULL"
    );
  }
  if (input.priceKes !== undefined) {
    params.push(input.priceKes);
    sets.push(`price_kes = $${params.length}`);
  }
  if (input.priceUnit !== undefined) {
    params.push(input.priceUnit);
    sets.push(`price_unit = $${params.length}`);
  }
  params.push(Number(req.params.id));
  const result = await query(
    `UPDATE propiq.properties SET ${sets.join(", ")}
      WHERE id = $${params.length}
      RETURNING ${PROPERTY_COLUMNS}`,
    params
  );
  if (result.rows.length === 0) {
    throw new Error(`property ${req.params.id} not found`);
  }
  return toProperty(result.rows[0]);
});

contractRoute(contract.kpiSummary, "kpi_summary_failed", async () => {
  const [statuses, leads] = await Promise.all([
    query("SELECT status, COUNT(*)::int AS count FROM propiq.properties GROUP BY status"),
    query("SELECT COUNT(*)::int AS count FROM propiq.leads"),
  ]);
  const byStatus = Object.fromEntries(statuses.rows.map((r) => [r.status, r.count]));
  return {
    activeListings: byStatus.available ?? 0,
    underOffer: byStatus.under_offer ?? 0,
    sold: byStatus.sold ?? 0,
    leadsCaptured: leads.rows[0].count,
  };
});

contractRoute(contract.listingsByStatus, "listings_by_status_failed", async () => {
  const result = await query(
    "SELECT status, COUNT(*)::int AS count FROM propiq.properties GROUP BY status"
  );
  const counts = Object.fromEntries(result.rows.map((r) => [r.status, r.count]));
  // Emit every status, zero-count included, so the donut legend is stable.
  return {
    breakdown: ListingStatus.options.map((status) => ({
      status,
      count: counts[status] ?? 0,
    })),
  };
});

contractRoute(contract.platformPerformance, "platform_performance_failed", async () => {
  const result = await query(
    `SELECT ac.property_id,
            p.name AS property_name,
            ac.platform,
            COALESCE(ac.impressions, 0)::int AS impressions,
            COALESCE(ac.reach, 0)::int AS reach,
            COALESCE(ac.likes, 0)::int AS likes,
            COALESCE(ac.comments, 0)::int AS comments,
            COALESCE(ac.shares, 0)::int AS shares,
            COALESCE(ac.clicks, 0)::int AS clicks,
            ac.fetched_at
       FROM propiq.analytics_cache ac
       JOIN propiq.properties p ON p.id = ac.property_id
      ORDER BY p.name, ac.platform`
  );
  const asOf = result.rows.length
    ? new Date(Math.max(...result.rows.map((r) => r.fetched_at.getTime()))).toISOString()
    : null;
  return {
    asOf,
    rows: result.rows.map((r) => ({
      propertyId: r.property_id,
      propertyName: r.property_name,
      platform: r.platform,
      impressions: r.impressions,
      reach: r.reach,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      clicks: r.clicks,
      engagement: r.likes + r.comments + r.shares + r.clicks,
    })),
  };
});

contractRoute(contract.salesOverTime, "sales_over_time_failed", async () => {
  // One month-spine query, zero-filled from the earliest record in either
  // table to the current month, so gap months render as 0 instead of
  // disappearing from the axis.
  const result = await query(
    `WITH bounds AS (
       SELECT date_trunc('month', LEAST(
                COALESCE((SELECT MIN(created_at) FROM propiq.properties), now()),
                COALESCE((SELECT MIN(created_at) FROM propiq.leads), now())
              )) AS start
     ),
     months AS (
       SELECT generate_series((SELECT start FROM bounds),
                              date_trunc('month', now()),
                              interval '1 month') AS month
     )
     SELECT to_char(m.month, 'YYYY-MM') AS month,
            (SELECT COUNT(*)::int FROM propiq.properties p
              WHERE date_trunc('month', p.created_at) = m.month) AS listings,
            (SELECT COUNT(*)::int FROM propiq.leads l
              WHERE date_trunc('month', l.created_at) = m.month) AS leads
       FROM months m
      ORDER BY m.month`
  );
  return { points: result.rows };
});

contractRoute(contract.leadFunnel, "lead_funnel_failed", async () => {
  const result = await query(
    "SELECT stage, COUNT(*)::int AS count FROM propiq.leads GROUP BY stage"
  );
  const atStage = Object.fromEntries(result.rows.map((r) => [r.stage, r.count]));
  // Cumulative from the right: a lead at "offer" has passed "viewing", so
  // each stage counts leads at that stage or any later one.
  const stages = LeadStage.options;
  let running = 0;
  const cumulative = [];
  for (let i = stages.length - 1; i >= 0; i--) {
    running += atStage[stages[i]] ?? 0;
    cumulative[i] = { stage: stages[i], count: running };
  }
  return { stages: cumulative };
});

contractRoute(contract.revenueTrend, "revenue_trend_failed", async () => {
  const result = await query(
    `SELECT to_char(date_trunc('month', sold_at), 'YYYY-MM') AS month,
            SUM(COALESCE(sale_price_kes, price_kes, 0))::float8 AS revenue_kes
       FROM propiq.properties
      WHERE status = 'sold' AND sold_at IS NOT NULL
      GROUP BY 1
      ORDER BY 1`
  );
  return {
    points: result.rows.map((r) => ({ month: r.month, revenueKes: r.revenue_kes })),
  };
});

contractRoute(contract.priceBands, "price_bands_failed", async () => {
  // Sale prices only: rents and per-area rates live on other scales and
  // would land in meaningless buckets.
  const result = await query(
    `SELECT CASE
              WHEN price_kes IS NULL THEN 'Unpriced'
              WHEN price_kes < 100000 THEN 'Under 100K'
              WHEN price_kes < 1000000 THEN '100K–1M'
              WHEN price_kes < 10000000 THEN '1M–10M'
              WHEN price_kes < 50000000 THEN '10M–50M'
              ELSE '50M+'
            END AS band,
            COUNT(*)::int AS count
       FROM propiq.properties
      WHERE price_unit = 'total'
      GROUP BY 1`
  );
  const counts = Object.fromEntries(result.rows.map((r) => [r.band, r.count]));
  // Emit every band in PriceBand order, zero-count included, so the axis is
  // stable regardless of the data.
  return {
    bands: PriceBand.options.map((band) => ({ band, count: counts[band] ?? 0 })),
  };
});

contractRoute(contract.recentLeads, "recent_leads_failed", async () => {
  const result = await query(
    `SELECT l.id, l.name, l.phone, l.source, l.stage, l.created_at,
            p.name AS property_name
       FROM propiq.leads l
       LEFT JOIN propiq.properties p ON p.id = l.property_id
      ORDER BY l.created_at DESC
      LIMIT 10`
  );
  return {
    leads: result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      propertyName: r.property_name,
      source: r.source,
      stage: r.stage,
      createdAt: r.created_at.toISOString(),
    })),
  };
});

function toLink(r) {
  return {
    id: r.id,
    propertyId: r.property_id,
    platform: r.platform,
    postUrl: r.post_url,
    linkedAt: r.linked_at.toISOString(),
  };
}

contractRoute(contract.listPlatformLinks, "list_platform_links_failed", async () => {
  const result = await query(
    `SELECT id, property_id, platform, post_url, linked_at
       FROM propiq.platform_links
      ORDER BY property_id, platform, id`
  );
  return { links: result.rows.map(toLink) };
});

contractRoute(contract.addPlatformLink, "add_platform_link_failed", async (req, input) => {
  // post_id is NOT NULL in PropIQ's schema but real platform post ids are
  // resolved by the Phase 3 fetchers, not entered by hand; '' means
  // "unresolved". (Phase 1 found hand-stored ids were wrong anyway.)
  const result = await query(
    `INSERT INTO propiq.platform_links (property_id, platform, post_id, post_url)
     VALUES ($1, $2, '', $3)
     RETURNING id, property_id, platform, post_url, linked_at`,
    [input.propertyId, input.platform, input.postUrl]
  );
  return toLink(result.rows[0]);
});

contractRoute(contract.deletePlatformLink, "delete_platform_link_failed", async (req) => {
  const result = await query("DELETE FROM propiq.platform_links WHERE id = $1 RETURNING id", [
    Number(req.params.id),
  ]);
  if (result.rows.length === 0) {
    throw new Error(`platform link ${req.params.id} not found`);
  }
  return { deleted: true };
});

contractRoute(contract.createLead, "create_lead_failed", async (req, input) => {
  const result = await query(
    `INSERT INTO propiq.leads (property_id, name, phone, source, stage)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, phone, source, stage, created_at, property_id`,
    [input.propertyId ?? null, input.name, input.phone ?? null, input.source, input.stage ?? "lead"]
  );
  const lead = result.rows[0];
  const prop = lead.property_id
    ? await query("SELECT name FROM propiq.properties WHERE id = $1", [lead.property_id])
    : null;
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    propertyName: prop?.rows[0]?.name ?? null,
    source: lead.source,
    stage: lead.stage,
    createdAt: lead.created_at.toISOString(),
  };
});

// Latest capture per post, joined to its post and property, across every
// platform. The shared SELECT for the KPIs, the top-posts list, and the
// per-property rollups.
const LATEST_POST_METRICS = `
  SELECT DISTINCT ON (pm.post_id)
         pm.post_id, pm.reach, pm.views, pm.likes, pm.comments,
         pm.shares, pm.saves,
         (COALESCE(pm.likes, 0) + COALESCE(pm.comments, 0)
          + COALESCE(pm.shares, 0) + COALESCE(pm.saves, 0)) AS engagement,
         po.platform, po.property_id, po.caption, po.permalink, po.published_at,
         pr.name AS property_name
    FROM propiq.post_metrics pm
    JOIN propiq.posts po ON po.id = pm.post_id
    JOIN propiq.properties pr ON pr.id = po.property_id
   ORDER BY pm.post_id, pm.captured_at DESC`;

// After a sync, refresh the property-level rollups PropIQ's tables model
// (analytics_cache feeds the Overview card; analytics_history accumulates
// the trend series), for one platform and the properties it touched.
async function refreshPropertyRollups(platform, propertyIds) {
  for (const propertyId of propertyIds) {
    const agg = await query(
      `SELECT COALESCE(SUM(reach), 0)::int AS reach,
              COALESCE(SUM(views), 0)::int AS views,
              COALESCE(SUM(likes), 0)::int AS likes,
              COALESCE(SUM(comments), 0)::int AS comments,
              COALESCE(SUM(shares), 0)::int AS shares
         FROM (${LATEST_POST_METRICS}) latest
        WHERE property_id = $1 AND platform = $2`,
      [propertyId, platform]
    );
    const a = agg.rows[0];
    await query("DELETE FROM propiq.analytics_cache WHERE property_id = $1 AND platform = $2", [
      propertyId,
      platform,
    ]);
    await query(
      `INSERT INTO propiq.analytics_cache
         (property_id, platform, impressions, likes, comments, shares, clicks, reach, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, now())`,
      [propertyId, platform, a.views, a.likes, a.comments, a.shares, a.reach]
    );
    await query(
      `INSERT INTO propiq.analytics_history
         (property_id, platform, impressions, likes, comments, shares, clicks, reach, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, now())`,
      [propertyId, platform, a.views, a.likes, a.comments, a.shares, a.reach]
    );
  }
}

// Rewrite one key in .env (used to persist the exchanged long-lived
// Facebook token so the short Explorer token only has to survive once).
function persistEnvValue(key, value) {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
  try {
    const lines = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => !line.startsWith(`${key}=`));
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    lines.push(`${key}=${value}`, "");
    fs.writeFileSync(envPath, lines.join("\n"));
  } catch (err) {
    console.error(`Could not persist ${key} to .env:`, err.message);
  }
}

contractRoute(contract.marketingOverview, "marketing_overview_failed", async () => {
  const [accountsResult, latest, trendRows] = await Promise.all([
    query(
      `SELECT a.platform, a.handle, a.last_synced_at,
              m.followers, m.media_count
         FROM propiq.platform_accounts a
         LEFT JOIN LATERAL (
           SELECT followers, media_count FROM propiq.account_metrics
            WHERE platform_account_id = a.id
            ORDER BY captured_at DESC LIMIT 1
         ) m ON true
        ORDER BY a.platform, a.id`
    ),
    query(LATEST_POST_METRICS),
    query(
      `SELECT a.platform, am.captured_at, am.followers
         FROM propiq.account_metrics am
         JOIN propiq.platform_accounts a ON a.id = am.platform_account_id
        ORDER BY a.platform, am.captured_at`
    ),
  ]);

  const reach = latest.rows.reduce((s, r) => s + (r.reach ?? 0), 0);
  const engagement = latest.rows.reduce((s, r) => s + Number(r.engagement), 0);
  // The rate only counts posts that HAVE a reach figure; posts with
  // engagement but no reach (common for manual entries) would otherwise
  // inflate the numerator against a denominator they never joined.
  const withReach = latest.rows.filter((r) => (r.reach ?? 0) > 0);
  const rateReach = withReach.reduce((s, r) => s + r.reach, 0);
  const rateEngagement = withReach.reduce((s, r) => s + Number(r.engagement), 0);
  const top = [...latest.rows]
    .sort((a, b) => Number(b.engagement) - Number(a.engagement))
    .slice(0, 5);

  const trendsByPlatform = new Map();
  for (const r of trendRows.rows) {
    if (!trendsByPlatform.has(r.platform)) trendsByPlatform.set(r.platform, []);
    trendsByPlatform.get(r.platform).push({
      capturedAt: r.captured_at.toISOString(),
      followers: r.followers,
    });
  }

  return {
    accounts: accountsResult.rows.map((a) => ({
      platform: a.platform,
      handle: a.handle,
      followers: a.followers ?? null,
      mediaCount: a.media_count ?? null,
      lastSyncedAt: a.last_synced_at ? a.last_synced_at.toISOString() : null,
    })),
    kpis: {
      reach,
      engagement,
      engagementRate: rateReach > 0 ? rateEngagement / rateReach : null,
      postsTracked: latest.rows.length,
    },
    followerTrends: [...trendsByPlatform.entries()].map(([platform, points]) => ({
      platform,
      points,
    })),
    topPosts: top.map((r) => ({
      postId: r.post_id,
      platform: r.platform,
      propertyName: r.property_name,
      caption: r.caption,
      permalink: r.permalink,
      publishedAt: r.published_at ? r.published_at.toISOString() : null,
      reach: r.reach,
      views: r.views,
      likes: r.likes,
      comments: r.comments,
      engagement: Number(r.engagement),
    })),
  };
});

contractRoute(contract.syncInstagram, "instagram_sync_failed", async () => {
  if (!env.META_ACCESS_TOKEN) {
    throw httpError(
      503,
      "Instagram credentials are not configured. Set META_ACCESS_TOKEN in .env, then restart the server."
    );
  }
  // Instagram-login tokens (IG... prefix) address the account as /me; only
  // Facebook-login tokens (EAA... prefix) need the numeric IG_USER_ID.
  const needsId = !isInstagramLoginToken(env.META_ACCESS_TOKEN);
  if (needsId && (!env.IG_USER_ID || env.IG_USER_ID === "0")) {
    throw httpError(
      503,
      "This token type needs IG_USER_ID (the numeric Instagram Business account id) set in .env."
    );
  }
  const creds = { igUserId: env.IG_USER_ID, accessToken: env.META_ACCESS_TOKEN };

  let account;
  try {
    account = await fetchAccount(creds);
  } catch (err) {
    throw httpError(502, err.message);
  }

  // Upsert the account row and snapshot followers for the trend chart.
  const accountRow = await query(
    `INSERT INTO propiq.platform_accounts (platform, handle, external_id, last_synced_at)
     VALUES ('instagram', $1, $2, now())
     ON CONFLICT (platform, handle)
     DO UPDATE SET external_id = EXCLUDED.external_id, last_synced_at = now()
     RETURNING id`,
    [account.username, account.id]
  );
  const accountId = accountRow.rows[0].id;
  await query(
    `INSERT INTO propiq.account_metrics (platform_account_id, followers, media_count)
     VALUES ($1, $2, $3)`,
    [accountId, account.followers, account.mediaCount]
  );

  // Match the account's media to the user's stored post links by permalink
  // code — never by guessing ids from the URL (the Phase 1 lesson).
  const links = await query(
    `SELECT id, property_id, post_url FROM propiq.platform_links WHERE platform = 'instagram'`
  );
  const media = links.rows.length ? await fetchMedia(creds) : [];
  const mediaByCode = new Map();
  for (const m of media) {
    const code = permalinkCode(m.permalink);
    if (code) mediaByCode.set(code, m);
  }

  let postsMatched = 0;
  let metricsCaptured = 0;
  let linksUnmatched = 0;
  const touchedProperties = new Set();

  for (const link of links.rows) {
    const code = permalinkCode(link.post_url);
    const m = code ? mediaByCode.get(code) : null;
    if (!m) {
      linksUnmatched++;
      continue;
    }
    postsMatched++;
    touchedProperties.add(link.property_id);

    const postRow = await query(
      `INSERT INTO propiq.posts
         (property_id, platform_account_id, platform, external_post_id,
          permalink, caption, media_type, published_at)
       VALUES ($1, $2, 'instagram', $3, $4, $5, $6, $7)
       ON CONFLICT (platform, external_post_id)
       DO UPDATE SET caption = EXCLUDED.caption, permalink = EXCLUDED.permalink
       RETURNING id`,
      [
        link.property_id,
        accountId,
        m.id,
        m.permalink ?? null,
        m.caption ?? null,
        m.media_type ?? null,
        m.timestamp ?? null,
      ]
    );
    // Resolve the link's placeholder post_id with the id the API returned.
    await query("UPDATE propiq.platform_links SET post_id = $1 WHERE id = $2", [m.id, link.id]);

    const insights = await fetchInsights({ mediaId: m.id, accessToken: creds.accessToken });
    await query(
      `INSERT INTO propiq.post_metrics
         (post_id, reach, views, likes, comments, shares, saves, total_interactions, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'api')`,
      [
        postRow.rows[0].id,
        insights.reach,
        insights.views,
        m.like_count ?? null,
        m.comments_count ?? null,
        insights.shares,
        insights.saves,
        insights.totalInteractions,
      ]
    );
    metricsCaptured++;
  }

  await refreshPropertyRollups("instagram", touchedProperties);

  return {
    account: {
      handle: account.username,
      followers: account.followers,
      mediaCount: account.mediaCount,
    },
    postsMatched,
    metricsCaptured,
    linksUnmatched,
  };
});

contractRoute(contract.syncFacebook, "facebook_sync_failed", async () => {
  if (!env.FB_ACCESS_TOKEN) {
    throw httpError(
      503,
      "Facebook credentials are not configured. Run scripts/add-facebook-keys.ps1, then restart the server."
    );
  }

  // Trade the stored token for a long-lived one when app credentials are
  // available, and persist it so a short Explorer token only has to
  // survive this one sync.
  let userToken = env.FB_ACCESS_TOKEN;
  const exchanged = await exchangeForLongLivedToken({
    token: userToken,
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
  });
  if (exchanged && exchanged !== userToken) {
    userToken = exchanged;
    env.FB_ACCESS_TOKEN = exchanged;
    persistEnvValue("FB_ACCESS_TOKEN", exchanged);
  }

  let page;
  try {
    page = await resolvePage({ userToken, pageId: env.FB_PAGE_ID });
  } catch (err) {
    throw httpError(502, err.message);
  }

  const accountRow = await query(
    `INSERT INTO propiq.platform_accounts (platform, handle, external_id, last_synced_at)
     VALUES ('facebook', $1, $2, now())
     ON CONFLICT (platform, handle)
     DO UPDATE SET external_id = EXCLUDED.external_id, last_synced_at = now()
     RETURNING id`,
    [page.name, page.id]
  );
  const accountId = accountRow.rows[0].id;
  await query(
    "INSERT INTO propiq.account_metrics (platform_account_id, followers) VALUES ($1, $2)",
    [accountId, page.followers]
  );

  const links = await query(
    "SELECT id, property_id, post_url FROM propiq.platform_links WHERE platform = 'facebook'"
  );
  const pagePosts = links.rows.length
    ? await fetchPagePosts({ pageId: page.id, pageToken: page.pageToken })
    : [];
  const postsByKey = new Map();
  for (const p of pagePosts) {
    for (const key of facebookApiPostKeys(p)) postsByKey.set(key, p);
  }

  let postsMatched = 0;
  let metricsCaptured = 0;
  let linksUnmatched = 0;
  const touchedProperties = new Set();

  for (const link of links.rows) {
    const key = facebookPostKey(link.post_url);
    const p = key ? postsByKey.get(key) : null;
    if (!p) {
      linksUnmatched++;
      continue;
    }
    postsMatched++;
    touchedProperties.add(link.property_id);

    const postRow = await query(
      `INSERT INTO propiq.posts
         (property_id, platform_account_id, platform, external_post_id,
          permalink, caption, published_at)
       VALUES ($1, $2, 'facebook', $3, $4, $5, $6)
       ON CONFLICT (platform, external_post_id)
       DO UPDATE SET caption = EXCLUDED.caption, permalink = EXCLUDED.permalink
       RETURNING id`,
      [
        link.property_id,
        accountId,
        p.id,
        p.permalink_url ?? null,
        p.message ?? null,
        p.created_time ?? null,
      ]
    );
    await query("UPDATE propiq.platform_links SET post_id = $1 WHERE id = $2", [p.id, link.id]);

    const insights = await fetchPostInsights({ postId: p.id, pageToken: page.pageToken });
    await query(
      `INSERT INTO propiq.post_metrics
         (post_id, reach, views, likes, comments, shares, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'api')`,
      [
        postRow.rows[0].id,
        insights.reach,
        insights.views,
        p.likes?.summary?.total_count ?? null,
        p.comments?.summary?.total_count ?? null,
        p.shares?.count ?? null,
      ]
    );
    metricsCaptured++;
  }

  await refreshPropertyRollups("facebook", touchedProperties);

  return {
    account: { handle: page.name, followers: page.followers, mediaCount: null },
    postsMatched,
    metricsCaptured,
    linksUnmatched,
  };
});

// Platforms whose numbers come from an API sync; everything else is
// hand-entered on the Marketing page.
const SYNCED_PLATFORMS = ["instagram", "facebook"];

function toManualEntry(r) {
  return {
    linkId: r.link_id,
    platform: r.platform,
    propertyName: r.property_name,
    postUrl: r.post_url,
    latest: r.captured_at
      ? {
          capturedAt: r.captured_at.toISOString(),
          views: r.views,
          reach: r.reach,
          likes: r.likes,
          comments: r.comments,
          shares: r.shares,
        }
      : null,
  };
}

const MANUAL_ENTRY_SELECT = `
  SELECT pl.id AS link_id, pl.platform, pl.post_url, pr.name AS property_name,
         lm.captured_at, lm.views, lm.reach, lm.likes, lm.comments, lm.shares
    FROM propiq.platform_links pl
    JOIN propiq.properties pr ON pr.id = pl.property_id
    LEFT JOIN propiq.posts po
      ON po.platform = pl.platform AND po.external_post_id = pl.post_url
    LEFT JOIN LATERAL (
      SELECT captured_at, views, reach, likes, comments, shares
        FROM propiq.post_metrics WHERE post_id = po.id
       ORDER BY captured_at DESC LIMIT 1
    ) lm ON true
   WHERE pl.platform <> ALL($1)`;

contractRoute(contract.manualEntryState, "manual_entry_state_failed", async () => {
  const [entries, accounts] = await Promise.all([
    query(`${MANUAL_ENTRY_SELECT} ORDER BY pr.name, pl.platform, pl.id`, [SYNCED_PLATFORMS]),
    query(
      `SELECT a.platform, a.handle, a.last_synced_at, m.followers
         FROM propiq.platform_accounts a
         LEFT JOIN LATERAL (
           SELECT followers FROM propiq.account_metrics
            WHERE platform_account_id = a.id
            ORDER BY captured_at DESC LIMIT 1
         ) m ON true
        WHERE a.platform <> ALL($1)
        ORDER BY a.platform, a.handle`,
      [SYNCED_PLATFORMS]
    ),
  ]);
  return {
    entries: entries.rows.map(toManualEntry),
    accounts: accounts.rows.map((a) => ({
      platform: a.platform,
      handle: a.handle,
      followers: a.followers ?? null,
      lastUpdatedAt: a.last_synced_at ? a.last_synced_at.toISOString() : null,
    })),
  };
});

contractRoute(contract.recordManualMetrics, "record_manual_metrics_failed", async (req, input) => {
  const linkResult = await query(
    `SELECT pl.id, pl.platform, pl.post_url, pl.property_id
       FROM propiq.platform_links pl WHERE pl.id = $1`,
    [input.linkId]
  );
  const link = linkResult.rows[0];
  if (!link) throw httpError(404, `Post link ${input.linkId} no longer exists.`);
  if (SYNCED_PLATFORMS.includes(link.platform)) {
    throw httpError(400, `${link.platform} metrics come from the sync, not manual entry.`);
  }

  // Manual posts use the stored URL as their external id — stable, unique
  // per platform, and never confused with a real API id.
  const postRow = await query(
    `INSERT INTO propiq.posts (property_id, platform, external_post_id, permalink)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (platform, external_post_id) DO UPDATE SET permalink = EXCLUDED.permalink
     RETURNING id`,
    [link.property_id, link.platform, link.post_url]
  );
  await query(
    `INSERT INTO propiq.post_metrics
       (post_id, views, reach, likes, comments, shares, source)
     VALUES ($1, $2, $3, $4, $5, $6, 'manual')`,
    [
      postRow.rows[0].id,
      input.views ?? null,
      input.reach ?? null,
      input.likes ?? null,
      input.comments ?? null,
      input.shares ?? null,
    ]
  );
  await refreshPropertyRollups(link.platform, [link.property_id]);

  const fresh = await query(`${MANUAL_ENTRY_SELECT} AND pl.id = $2`, [
    SYNCED_PLATFORMS,
    link.id,
  ]);
  return toManualEntry(fresh.rows[0]);
});

contractRoute(contract.recordManualFollowers, "record_manual_followers_failed", async (req, input) => {
  if (SYNCED_PLATFORMS.includes(input.platform)) {
    throw httpError(400, `${input.platform} followers come from the sync, not manual entry.`);
  }
  const accountRow = await query(
    `INSERT INTO propiq.platform_accounts (platform, handle, last_synced_at)
     VALUES ($1, $2, now())
     ON CONFLICT (platform, handle) DO UPDATE SET last_synced_at = now()
     RETURNING id, last_synced_at`,
    [input.platform, input.handle]
  );
  await query(
    "INSERT INTO propiq.account_metrics (platform_account_id, followers) VALUES ($1, $2)",
    [accountRow.rows[0].id, input.followers]
  );
  return {
    platform: input.platform,
    handle: input.handle,
    followers: input.followers,
    lastUpdatedAt: accountRow.rows[0].last_synced_at.toISOString(),
  };
});

contractRoute(contract.listingsByLocation, "listings_by_location_failed", async () => {
  const result = await query(
    `SELECT COALESCE(NULLIF(TRIM(location), ''), 'Unspecified') AS location,
            COUNT(*)::int AS count
       FROM propiq.properties
      GROUP BY 1
      ORDER BY count DESC, location ASC`
  );
  return { breakdown: result.rows };
});

app.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
});
