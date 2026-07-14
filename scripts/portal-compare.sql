-- scripts/portal-compare.sql
-- Phase B/C check: while manual entry and scraping coexist, compare the
-- two per listing per week. Investigate divergence above 5 percent.
-- Adapted to the 005 time-series design: latest capture per week per
-- source, compared side by side.

WITH weekly AS (
  SELECT pl.external_id,
         date_trunc('week', pm.captured_at)::date AS wk,
         pm.source,
         max(pm.views) AS views,
         max(pm.inquiries) AS inquiries
  FROM propiq.portal_listing_metrics pm
  JOIN propiq.portal_listings pl ON pl.id = pm.portal_listing_id
  WHERE pl.portal_id = (SELECT id FROM propiq.portals WHERE code = 'buyrentkenya')
    AND pm.captured_at >= now() - interval '21 days'
  GROUP BY 1, 2, 3
)
SELECT
  COALESCE(s.external_id, m.external_id) AS listing,
  COALESCE(s.wk, m.wk)                   AS week,
  m.views  AS manual_or_import_views,
  s.views  AS scraped_views,
  CASE WHEN m.views > 0
       THEN round(100.0 * abs(s.views - m.views) / m.views, 1)
  END AS divergence_pct
FROM (SELECT * FROM weekly WHERE source = 'scrape') s
FULL OUTER JOIN (SELECT * FROM weekly WHERE source IN ('manual', 'import')) m
  USING (external_id, wk)
ORDER BY divergence_pct DESC NULLS LAST;

-- Rows with manual but no scrape: the fetcher missed a listing. Fix first.
-- Rows with scrape but no manual: fine; the scraper covers more.
-- Divergence above 5 percent: check whether manual entry recorded a
-- different metric (impressions vs views) or a different day.

-- Scraper health:
SELECT portal_code,
       max(started_at) FILTER (WHERE status = 'ok')    AS last_success,
       max(started_at) FILTER (WHERE status = 'error') AS last_error,
       count(*) FILTER (WHERE status = 'error'
                          AND started_at >= now() - interval '7 days') AS errors_7d
FROM propiq.portal_sync_runs
GROUP BY portal_code
ORDER BY portal_code;
