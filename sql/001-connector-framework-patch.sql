-- 001-connector-framework-patch.sql
-- Idempotent patch on top of sync-integration-v2 tables.
-- The framework writes to sync_runs columns (source_type, detail, counts);
-- add any that the v2 migration didn't already create.
-- Adjust the schema name if not 'propiq'. Safe to run twice.

ALTER TABLE propiq.sync_runs ADD COLUMN IF NOT EXISTS source_type TEXT;          -- 'social' | 'portal'
ALTER TABLE propiq.sync_runs ADD COLUMN IF NOT EXISTS detail TEXT;               -- failure detail
ALTER TABLE propiq.sync_runs ADD COLUMN IF NOT EXISTS counts JSONB;              -- rows written per kind
ALTER TABLE propiq.sync_runs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- Portal rows the connectors resolve by slug. Idempotent.
INSERT INTO propiq.portals (slug, name)
VALUES ('buyrentkenya', 'BuyRentKenya'), ('property24', 'Property24'), ('kedwell', 'Kedwell')
ON CONFLICT (slug) DO NOTHING;
