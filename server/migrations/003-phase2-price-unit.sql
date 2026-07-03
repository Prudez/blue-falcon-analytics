-- 003 — Phase 2: price unit on properties.
--
-- The live data mixes pricing scales: monthly rents (35K), sale prices
-- (2M–18.1M), and land that is naturally priced per acre. price_kes alone
-- cannot distinguish them, so this adds the unit next to the number.
-- Existing rows default to 'total' (a sale price); rents and land get
-- re-tagged through the Listings editor.
--
-- Idempotent: safe to run more than once.

ALTER TABLE propiq.properties
  ADD COLUMN IF NOT EXISTS price_unit text NOT NULL DEFAULT 'total';

ALTER TABLE propiq.properties
  DROP CONSTRAINT IF EXISTS properties_price_unit_check;
ALTER TABLE propiq.properties
  ADD CONSTRAINT properties_price_unit_check
  CHECK (price_unit IN ('total', 'per_month', 'per_sqft', 'per_acre'));
