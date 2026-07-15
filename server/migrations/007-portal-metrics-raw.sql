-- 007 - Add a raw snapshot column to portal_listing_metrics.
--
-- Migration 005 followed the 004 social-table house style, which has no
-- `raw` column: API syncs (Instagram/Facebook) have no selectors to break,
-- so there is nothing to snapshot. Portal fetchers are the opposite — they
-- are scrapers, and the portal-sync skill's selector strategy depends on
-- storing the last-seen HTML of each listing row so that when a CSS class
-- changes months later, you diff against yesterday's snapshot instead of
-- guessing. This is a deliberate, portal-only deviation from the social
-- tables for that reason.
--
-- `raw` also carries per-capture extras the fixed columns don't model:
-- boosted/promoted status (explains anomalous view spikes), and the split
-- impressions-vs-views terminology some Kenyan portal CRMs use.
--
-- jsonb, nullable, no default: a NULL raw means "not captured" (e.g. the
-- import/manual sources), same NULL-means-absent convention as the metric
-- columns.
--
-- Idempotent: safe to run more than once.

ALTER TABLE propiq.portal_listing_metrics
  ADD COLUMN IF NOT EXISTS raw jsonb;
