// server/index.js
//
// Express entry point. Routes validate their responses against
// shared/contract.js before sending, so a shape drift fails loudly here
// instead of silently on the client.

import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { query } from "./db.js";
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
// endpoint's response schema before they leave the process.
function contractRoute(endpoint, errorCode, handler) {
  app.get(endpoint.path, async (req, res) => {
    try {
      const body = endpoint.response.parse(await handler(req));
      res.json(body);
    } catch (err) {
      console.error(`GET ${endpoint.path} failed:`, err.message);
      const body = ErrorResponse.parse({
        error: errorCode,
        message: "Query failed. Check the server log.",
      });
      res.status(503).json(body);
    }
  });
}

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
