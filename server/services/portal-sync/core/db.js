// server/services/portal-sync/core/db.js
//
// Upsert helpers for portal-sync, written against migration 005's tables
// (propiq.portals / portal_listings / portal_listing_metrics /
// portal_sync_runs). Reuses the app's existing pooled `query` from
// server/db.js — it carries the pooler's dead-connection retry — so this
// service never opens a second pool.
//
// House conventions this follows (and where it deliberately differs from
// the portal-sync skill's generic skeleton, which the brief says the repo
// wins over):
//   - metrics are a time series keyed on `captured_at`, not a `metric_date`
//     column, matching post_metrics from migration 004;
//   - there is no `raw` column on listings or metrics in 005, so nothing
//     here writes one;
//   - the audit trail is the dedicated `portal_sync_runs` table, not a
//     shared sync_runs table;
//   - same-day re-runs upsert against 005's expression index
//     portal_listing_metrics_daily_uq, so a retried scrape overwrites the
//     day rather than duplicating it.

import { query } from "../../../db.js";

// Portals are seeded by migration 005. This upsert keeps `name`/`base_url`
// current for a known code and is a safety net if a new portal module runs
// before its seed row exists; it never touches is_active.
export async function upsertPortal({ code, name, baseUrl }) {
  const { rows } = await query(
    `INSERT INTO propiq.portals (code, name, base_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (code)
     DO UPDATE SET name = EXCLUDED.name, base_url = EXCLUDED.base_url
     RETURNING id`,
    [code, name, baseUrl ?? ""]
  );
  return rows[0].id;
}

// One row per property per portal, natural key (portal_id, external_id).
// external_id is the portal's own listing id from its URL, never a name.
export async function upsertPortalListing(portalId, listing) {
  const { rows } = await query(
    `INSERT INTO propiq.portal_listings
       (portal_id, external_id, title, url, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (portal_id, external_id)
     DO UPDATE SET title = EXCLUDED.title,
                   url = EXCLUDED.url,
                   status = EXCLUDED.status
     RETURNING id`,
    [
      portalId,
      listing.external_id,
      listing.title ?? null,
      listing.url ?? null,
      listing.status ?? null,
    ]
  );
  return rows[0].id;
}

// A daily snapshot. captured_at defaults to now() so the day is derived
// from insert time; the ON CONFLICT target is 005's expression index, so a
// second run on the same UTC day overwrites rather than inserting a
// duplicate. A metric the portal does not provide stays NULL — never 0.
export async function upsertPortalMetrics(portalListingId, metrics, source = "scrape") {
  const m = metrics ?? {};
  await query(
    `INSERT INTO propiq.portal_listing_metrics
       (portal_listing_id, views, saves, contact_clicks,
        phone_reveals, whatsapp_clicks, inquiries, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (portal_listing_id, ((captured_at AT TIME ZONE 'UTC')::date))
     DO UPDATE SET views = EXCLUDED.views,
                   saves = EXCLUDED.saves,
                   contact_clicks = EXCLUDED.contact_clicks,
                   phone_reveals = EXCLUDED.phone_reveals,
                   whatsapp_clicks = EXCLUDED.whatsapp_clicks,
                   inquiries = EXCLUDED.inquiries,
                   source = EXCLUDED.source`,
    [
      portalListingId,
      m.views ?? null,
      m.saves ?? null,
      m.contact_clicks ?? null,
      m.phone_reveals ?? null,
      m.whatsapp_clicks ?? null,
      m.inquiries ?? null,
      source,
    ]
  );
}

// Audit trail. One row per portal per run; opened here, closed by finishRun.
export async function startRun(portalCode, trigger = "cron") {
  const { rows } = await query(
    `INSERT INTO propiq.portal_sync_runs (portal_code, trigger)
     VALUES ($1, $2)
     RETURNING id`,
    [portalCode, trigger]
  );
  return rows[0].id;
}

export async function finishRun(
  runId,
  { status, listingsSeen = null, error = null, detail = null }
) {
  await query(
    `UPDATE propiq.portal_sync_runs
     SET finished_at = now(), status = $2, listings_seen = $3,
         error = $4, detail = $5
     WHERE id = $1`,
    [runId, status, listingsSeen, error, detail]
  );
}

// Drives the rolling-window `since` passed to a fetcher: null on the first
// ever successful run (fetch everything), otherwise the last success time.
export async function lastSuccessfulRun(portalCode) {
  const { rows } = await query(
    `SELECT started_at FROM propiq.portal_sync_runs
     WHERE portal_code = $1 AND status = 'ok'
     ORDER BY started_at DESC
     LIMIT 1`,
    [portalCode]
  );
  return rows.length ? rows[0].started_at : null;
}
