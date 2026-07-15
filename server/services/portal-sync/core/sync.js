// server/services/portal-sync/core/sync.js
//
// The generic loop. It knows no portal specifics: login -> fetch ->
// normalize -> upsert, once per portal. One portal failing (bad selector,
// login rejected, timeout) is recorded in portal_sync_runs and does NOT
// stop the others — a single dead selector must never take down the whole
// sync. Each configured portal opens its own persistent Playwright context.

import {
  upsertPortal,
  upsertPortalListing,
  upsertPortalMetrics,
  startRun,
  finishRun,
  lastSuccessfulRun,
} from "./db.js";
import { openPortalContext } from "./browser.js";

// `openContext` is injectable so tests (and the Phase A dry run) can drive
// the loop without launching a real browser.
export async function syncAll(
  portals,
  env,
  { trigger = "cron", openContext = openPortalContext } = {}
) {
  const results = [];

  for (const portal of portals) {
    // Unconfigured portals are disabled, not errors: record a skipped run
    // and move on. This is the Phase A steady state for every portal.
    if (!portal.isConfigured(env)) {
      const runId = await startRun(portal.code, trigger);
      await finishRun(runId, {
        status: "skipped",
        listingsSeen: 0,
        detail: "credentials not configured",
      });
      results.push({ portal: portal.code, status: "skipped", listings: 0, error: null });
      continue;
    }

    const runId = await startRun(portal.code, trigger);
    let ctx;
    try {
      const portalId = await upsertPortal({
        code: portal.code,
        name: portal.displayName ?? portal.code,
        baseUrl: portal.baseUrl ?? "",
      });

      // Rolling window, mirroring the social sync: null until the first
      // success (fetch everything), then a lookback from the last success.
      const hadSuccess = await lastSuccessfulRun(portal.code);
      const refreshDays = Number(env.PORTAL_SYNC_REFRESH_DAYS ?? 30);
      const since = hadSuccess
        ? new Date(Date.now() - refreshDays * 86_400_000)
        : null;

      ctx = await openContext(portal.code, env);
      await portal.login(ctx.page, env);
      const listings = await portal.fetchListings(ctx.page, env, since);

      for (const listing of listings) {
        const portalListingId = await upsertPortalListing(portalId, listing);
        await upsertPortalMetrics(portalListingId, listing.metrics, {
          source: "scrape",
          raw: listing.raw ?? null,
        });
      }

      await finishRun(runId, { status: "ok", listingsSeen: listings.length });
      results.push({
        portal: portal.code,
        status: "ok",
        listings: listings.length,
        error: null,
      });
    } catch (err) {
      const message = err?.message ? String(err.message) : String(err);
      await finishRun(runId, { status: "error", error: message });
      results.push({ portal: portal.code, status: "error", listings: null, error: message });
    } finally {
      if (ctx) await ctx.close().catch(() => {});
    }
  }

  return results;
}
