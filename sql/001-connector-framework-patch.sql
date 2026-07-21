-- 001-connector-framework-patch.sql
-- Applied to production 21 Jul 2026. Idempotent; safe to run twice.
-- Creates the unified sync_runs audit table and seeds portals on the
-- live column names (code, base_url). Corrected from the shipped version
-- which assumed a slug column and an existing sync_runs table.
CREATE TABLE IF NOT EXISTS propiq.sync_runs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source      TEXT NOT NULL,
  source_type TEXT,
  status      TEXT NOT NULL,
  detail      TEXT,
  counts      JSONB,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_source ON propiq.sync_runs (source, started_at DESC);

ALTER TABLE propiq.sync_runs ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE propiq.sync_runs ADD COLUMN IF NOT EXISTS detail TEXT;
ALTER TABLE propiq.sync_runs ADD COLUMN IF NOT EXISTS counts JSONB;
ALTER TABLE propiq.sync_runs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

INSERT INTO propiq.portals (code, name, base_url)
VALUES
  ('buyrentkenya', 'BuyRentKenya', 'https://www.buyrentkenya.com'),
  ('property24',   'Property24',   'https://www.property24.co.ke'),
  ('kedwell',      'Kedwell',      'https://kedwell.co.ke')
ON CONFLICT (code) DO NOTHING;
