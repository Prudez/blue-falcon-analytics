-- 006 - Backfill: preserve historical BuyRentKenya numbers from
-- propiq.buyrent_manual_stats (the manual-entry table from the original
-- PropIQ app, in the same live Supabase) into portal_listing_metrics.
-- The portal only shows current numbers; this history is unrecoverable
-- if lost, so it moves before manual entry stops.
--
-- STOP: this file cannot run as-is. buyrent_manual_stats' exact columns
-- were unknown when this was written. Run
--   SELECT * FROM propiq.buyrent_manual_stats LIMIT 5;
-- complete every TODO, then remove this banner. The transaction defaults
-- to ROLLBACK so a blind run does nothing.

BEGIN;

-- Step 1: create portal_listings rows for every listing in the manual
-- table that does not exist yet.
-- TODO: replace listing_ref with the real identifying column (a
-- BuyRentKenya listing id, a URL to extract the id from, or a name).
-- Prefer a real id; a name-slug will not match the first automated
-- scrape and would create a duplicate listing row.
INSERT INTO propiq.portal_listings (portal_id, external_id, title, status)
SELECT
  (SELECT id FROM propiq.portals WHERE code = 'buyrentkenya'),
  m.listing_ref::text,                        -- TODO real column
  m.listing_title,                            -- TODO real column or NULL
  'active'
FROM propiq.buyrent_manual_stats m
GROUP BY m.listing_ref, m.listing_title       -- TODO match the above
ON CONFLICT (portal_id, external_id) DO NOTHING;

-- Step 2: copy metric rows as captures, source 'import'.
-- Columns never recorded manually stay NULL. Do not invent zeros: NULL
-- means "not recorded", 0 means "recorded as zero".
-- TODO: captured_at must be when the numbers were observed, not now().
-- If the manual table has no date column, use its created_at and record
-- that decision in the workstream phase handoff.
INSERT INTO propiq.portal_listing_metrics
  (portal_listing_id, captured_at, views, saves, contact_clicks,
   phone_reveals, whatsapp_clicks, inquiries, source)
SELECT
  pl.id,
  m.recorded_at,                              -- TODO real date column
  m.views,                                    -- TODO real column
  m.shortlists,                               -- TODO real column or NULL
  m.inquiries,                                -- TODO real column or NULL
  m.calls,                                    -- TODO real column or NULL
  NULL,
  m.inquiries,                                -- TODO or NULL
  'import'
FROM propiq.buyrent_manual_stats m
JOIN propiq.portal_listings pl
  ON pl.external_id = m.listing_ref::text     -- TODO match Step 1's key
 AND pl.portal_id = (SELECT id FROM propiq.portals WHERE code = 'buyrentkenya')
ON CONFLICT (portal_listing_id, ((captured_at AT TIME ZONE 'UTC')::date))
DO NOTHING;
-- DO NOTHING: if a scrape already captured that day, the scraped number
-- wins over the manual one.

-- Step 3: verify before committing. Counts should be close; a large gap
-- means Step 2's join key missed.
SELECT
  (SELECT count(*) FROM propiq.buyrent_manual_stats)          AS manual_rows,
  (SELECT count(*) FROM propiq.portal_listing_metrics
    WHERE source = 'import')                                   AS migrated_rows;

-- Eyeball one listing against the old table before committing.

-- COMMIT;   -- uncomment after the verify step looks right
ROLLBACK;    -- default: a blind run does nothing
