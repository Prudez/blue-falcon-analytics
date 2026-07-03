-- 004 — Phase 3: social tracking tables.
--
-- The brief assumed posts/post_metrics/platform_accounts existed in the
-- live DB; they do not (Phase 1 correction). Created here, adapted from
-- PropIQ's design doc (Downloads/propiq_social_tracking.sql) to the live
-- propiq conventions: integer identity ids (properties.id is integer, not
-- uuid), the propiq schema, and no platform CHECK so user-added platforms
-- keep working. Access tokens are NEVER stored in the database; they live
-- in .env only, so there is no token_ref column.
--
-- post_metrics is a time series: one row per capture per post, so a post's
-- trajectory is visible, not just its latest number. account_metrics does
-- the same for follower counts (analytics_history has no followers column).
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS propiq.platform_accounts (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform text NOT NULL,
  handle text NOT NULL,
  external_id text,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, handle)
);

CREATE TABLE IF NOT EXISTS propiq.posts (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id integer NOT NULL REFERENCES propiq.properties(id) ON DELETE CASCADE,
  platform_account_id integer REFERENCES propiq.platform_accounts(id),
  platform text NOT NULL,
  external_post_id text NOT NULL,
  permalink text,
  caption text,
  media_type text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_post_id)
);

CREATE INDEX IF NOT EXISTS posts_property_idx ON propiq.posts (property_id);

CREATE TABLE IF NOT EXISTS propiq.post_metrics (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id integer NOT NULL REFERENCES propiq.posts(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  reach integer,
  views integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  total_interactions integer,
  source text NOT NULL DEFAULT 'api' CHECK (source IN ('api', 'manual'))
);

CREATE INDEX IF NOT EXISTS post_metrics_post_idx
  ON propiq.post_metrics (post_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS propiq.account_metrics (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform_account_id integer NOT NULL
    REFERENCES propiq.platform_accounts(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  followers integer,
  media_count integer
);
