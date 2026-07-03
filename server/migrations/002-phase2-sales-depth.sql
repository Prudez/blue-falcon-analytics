-- 002 — Phase 2: lead funnel stage and closed-sale fields.
--
-- The lead funnel (lead → viewing → offer → closed) needs a stage on each
-- lead, and the revenue trend needs the final sale price and close date on
-- sold properties. Both are ADDITIVE: a defaulted column on leads and two
-- nullable columns on properties. The running PropIQ app reads none of them.
--
-- Idempotent: safe to run more than once.

ALTER TABLE propiq.leads
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'lead';

ALTER TABLE propiq.leads
  DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE propiq.leads
  ADD CONSTRAINT leads_stage_check
  CHECK (stage IN ('lead', 'viewing', 'offer', 'closed'));

ALTER TABLE propiq.properties
  ADD COLUMN IF NOT EXISTS sale_price_kes bigint,
  ADD COLUMN IF NOT EXISTS sold_at date;
