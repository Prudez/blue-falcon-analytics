-- 001 — Phase 1: sales columns and leads table.
--
-- The live PropIQ schema turned out to lack the sales-side structures the
-- brief assumed (properties.status, location, price, and the leads table).
-- This migration adds them ADDITIVELY: nullable or defaulted columns and a
-- new table only. The running PropIQ app neither selects nor writes these,
-- so it is unaffected.
--
-- Idempotent: safe to run more than once.

ALTER TABLE propiq.properties
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS price_kes bigint;

ALTER TABLE propiq.properties
  DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE propiq.properties
  ADD CONSTRAINT properties_status_check
  CHECK (status IN ('available', 'under_offer', 'sold'));

CREATE TABLE IF NOT EXISTS propiq.leads (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id integer REFERENCES propiq.properties(id),
  name text NOT NULL,
  phone text,
  source text NOT NULL DEFAULT 'walk_in'
    CHECK (source IN ('facebook', 'instagram', 'tiktok', 'twitter', 'walk_in', 'other')),
  created_at timestamptz NOT NULL DEFAULT now()
);
