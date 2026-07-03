// server/index.js
//
// Express entry point. Routes validate their responses against
// shared/contract.js before sending, so a shape drift fails loudly here
// instead of silently on the client.

import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { query } from "./db.js";
import { contract, ErrorResponse, ListingStatus } from "../shared/contract.js";

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
