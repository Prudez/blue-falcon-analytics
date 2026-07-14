-- 005 - Sync-integration workstream: property portal tables.
--
-- Adds ingestion tables for property portals (BuyRentKenya, Property24,
-- Kedwell) alongside the social tables from 004. Follows the 004
-- conventions: integer identity ids, propiq schema, no CHECK on portal
-- codes so new portals keep working, credentials NEVER in the database
-- (portal logins live in .env only), and metrics as a time series with
-- captured_at, matching post_metrics, so a listing's trajectory is
-- visible rather than only its latest number.
--
-- One addition beyond the 004 pattern: a unique index on
-- (portal_listing_id, capture day). Portal fetchers are scrapers and
-- re-run more often than API syncs (retries after selector failures),
-- so same-day re-runs must upsert, not duplicate. Upserts target this
-- index via ON CONFLICT.
--
-- portal_sync_runs is the scraper audit trail: when numbers stop
-- moving, this table says whether it was a login failure, a broken
-- selector, or the portal genuinely flatlining.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS propiq.portals (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  base_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS propiq.portal_listings (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_id integer NOT NULL REFERENCES propiq.portals(id) ON DELETE CASCADE,
  property_id integer REFERENCES propiq.properties(id) ON DELETE SET NULL,
  external_id text NOT NULL,
  title text,
  url text,
  status text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_id, external_id)
);
CREATE INDEX IF NOT EXISTS portal_listings_property_idx
  ON propiq.portal_listings (property_id);

-- Time series, one row per capture per listing, like post_metrics.
-- source: 'scrape' (portal fetcher), 'manual' (typed in), 'import'
-- (backfilled from buyrent_manual_stats or a CSV).
CREATE TABLE IF NOT EXISTS propiq.portal_listing_metrics (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_listing_id integer NOT NULL
    REFERENCES propiq.portal_listings(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  views integer,
  saves integer,
  contact_clicks integer,
  phone_reveals integer,
  whatsapp_clicks integer,
  inquiries integer,
  source text NOT NULL DEFAULT 'scrape'
    CHECK (source IN ('scrape', 'manual', 'import'))
);
CREATE INDEX IF NOT EXISTS portal_listing_metrics_listing_idx
  ON propiq.portal_listing_metrics (portal_listing_id, captured_at DESC);

-- Same-day re-runs upsert instead of duplicating. The expression form
-- (AT TIME ZONE 'UTC') keeps the index immutable.
CREATE UNIQUE INDEX IF NOT EXISTS portal_listing_metrics_daily_uq
  ON propiq.portal_listing_metrics
  (portal_listing_id, ((captured_at AT TIME ZONE 'UTC')::date));

-- Scraper audit trail. Deliberately separate from any social sync
-- logging: scrapers fail differently (selectors, logins, timeouts) and
-- this table is the first place to look when portal numbers go stale.
CREATE TABLE IF NOT EXISTS propiq.portal_sync_runs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal_code text NOT NULL,
  trigger text NOT NULL DEFAULT 'cron',  -- 'cron' | 'manual' | 'import'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  listings_seen integer,
  status text,                            -- 'ok' | 'error' | 'skipped'
  error text,
  detail text
);
CREATE INDEX IF NOT EXISTS portal_sync_runs_portal_idx
  ON propiq.portal_sync_runs (portal_code, started_at DESC);

INSERT INTO propiq.portals (code, name, base_url) VALUES
  ('buyrentkenya', 'BuyRentKenya', 'https://www.buyrentkenya.com'),
  ('property24',   'Property24',   'https://www.property24.co.ke'),
  ('kedwell',      'Kedwell',      'https://kedwell.co.ke')
ON CONFLICT (code) DO NOTHING;
