// core/db.js
// Pooled pg access + upsert-only write helpers.
// Targets the tables already created by sync-integration-v2 (social_posts,
// social_post_metrics, portals, portal_listings, portal_listing_metrics,
// sync_runs, properties) — this file adds no schema, it writes to it.
// Every write is an upsert on a natural key. Plain INSERT for metrics is a bug.

const { Pool } = require('pg');
const { config } = require('./config');

const S = config.DB_SCHEMA; // e.g. 'propiq'

function makeDb(existingPool) {
  // Reuse the app's pool when embedded in the Express server; create one when standalone.
  const pool =
    existingPool ||
    new Pool({
      connectionString: config.DATABASE_URL,
      max: 5,
    });

  const q = (text, params) => pool.query(text, params);

  return {
    pool,

    // ---- sync_runs audit trail ------------------------------------------
    async startRun(source, sourceType) {
      const { rows } = await q(
        `INSERT INTO ${S}.sync_runs (source, source_type, status, started_at)
         VALUES ($1, $2, 'running', NOW())
         RETURNING id`,
        [source, sourceType]
      );
      return rows[0].id;
    },

    async finishRun(runId, status, detail = null, counts = null) {
      await q(
        `UPDATE ${S}.sync_runs
         SET status = $2, detail = $3, counts = $4, finished_at = NOW()
         WHERE id = $1`,
        [runId, status, detail, counts ? JSON.stringify(counts) : null]
      );
    },

    // ---- social ----------------------------------------------------------
    async upsertSocialPost(p) {
      const { rows } = await q(
        `INSERT INTO ${S}.social_posts
           (platform, external_id, property_id, posted_at, permalink, caption, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (platform, external_id) DO UPDATE SET
           property_id = COALESCE(EXCLUDED.property_id, ${S}.social_posts.property_id),
           permalink   = COALESCE(EXCLUDED.permalink, ${S}.social_posts.permalink),
           caption     = COALESCE(EXCLUDED.caption, ${S}.social_posts.caption),
           raw         = EXCLUDED.raw
         RETURNING id`,
        [p.platform, p.external_id, p.property_id, p.posted_at, p.permalink, p.caption, p.raw]
      );
      return rows[0].id;
    },

    async upsertSocialMetric(postId, m) {
      await q(
        `INSERT INTO ${S}.social_post_metrics
           (social_post_id, metric_date, views, reach, likes, comments, shares, saves, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (social_post_id, metric_date) DO UPDATE SET
           views = EXCLUDED.views, reach = EXCLUDED.reach, likes = EXCLUDED.likes,
           comments = EXCLUDED.comments, shares = EXCLUDED.shares, saves = EXCLUDED.saves,
           raw = EXCLUDED.raw`,
        [postId, m.metric_date, m.views, m.reach, m.likes, m.comments, m.shares, m.saves, m.raw]
      );
    },

    // ---- portals ---------------------------------------------------------
    async getPortalId(slug) {
      const { rows } = await q(`SELECT id FROM ${S}.portals WHERE slug = $1`, [slug]);
      if (!rows.length) throw new Error(`Portal '${slug}' has no row in ${S}.portals`);
      return rows[0].id;
    },

    async upsertPortalListing(portalId, l) {
      const { rows } = await q(
        `INSERT INTO ${S}.portal_listings (portal_id, external_id, property_id, title, url, raw)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (portal_id, external_id) DO UPDATE SET
           property_id = COALESCE(EXCLUDED.property_id, ${S}.portal_listings.property_id),
           title = COALESCE(EXCLUDED.title, ${S}.portal_listings.title),
           url   = COALESCE(EXCLUDED.url, ${S}.portal_listings.url),
           raw   = EXCLUDED.raw
         RETURNING id`,
        [portalId, l.external_id, l.property_id, l.title, l.url, l.raw]
      );
      return rows[0].id;
    },

    async upsertPortalMetric(listingId, m) {
      await q(
        `INSERT INTO ${S}.portal_listing_metrics
           (portal_listing_id, metric_date, views, saves, contact_clicks,
            phone_reveals, whatsapp_clicks, inquiries, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (portal_listing_id, metric_date) DO UPDATE SET
           views = EXCLUDED.views, saves = EXCLUDED.saves,
           contact_clicks = EXCLUDED.contact_clicks, phone_reveals = EXCLUDED.phone_reveals,
           whatsapp_clicks = EXCLUDED.whatsapp_clicks, inquiries = EXCLUDED.inquiries,
           raw = EXCLUDED.raw`,
        [
          listingId, m.metric_date, m.views, m.saves, m.contact_clicks,
          m.phone_reveals, m.whatsapp_clicks, m.inquiries, m.raw,
        ]
      );
    },

    // ---- one entry point the manager calls with a validated FetchResult --
    async persistFetchResult(result) {
      const counts = { posts: 0, socialMetrics: 0, listings: 0, portalMetrics: 0 };

      const postIds = new Map(); // `${platform}:${external_id}` -> id
      for (const p of result.posts) {
        const id = await this.upsertSocialPost(p);
        postIds.set(`${p.platform}:${p.external_id}`, id);
        counts.posts++;
      }
      for (const m of result.socialMetrics) {
        let id = postIds.get(`${m.platform}:${m.external_id}`);
        if (!id) {
          // Metric for a post not in this batch — resolve or create a shell row.
          id = await this.upsertSocialPost({
            platform: m.platform, external_id: m.external_id,
            property_id: null, posted_at: null, permalink: null, caption: null, raw: {},
          });
        }
        await this.upsertSocialMetric(id, m);
        counts.socialMetrics++;
      }

      const portalIds = new Map();
      const listingIds = new Map();
      for (const l of result.listings) {
        if (!portalIds.has(l.portal)) portalIds.set(l.portal, await this.getPortalId(l.portal));
        const id = await this.upsertPortalListing(portalIds.get(l.portal), l);
        listingIds.set(`${l.portal}:${l.external_id}`, id);
        counts.listings++;
      }
      for (const m of result.portalMetrics) {
        let id = listingIds.get(`${m.portal}:${m.external_id}`);
        if (!id) {
          if (!portalIds.has(m.portal)) portalIds.set(m.portal, await this.getPortalId(m.portal));
          id = await this.upsertPortalListing(portalIds.get(m.portal), {
            external_id: m.external_id, property_id: null, title: null, url: null, raw: {},
          });
        }
        await this.upsertPortalMetric(id, m);
        counts.portalMetrics++;
      }

      return counts;
    },
  };
}

module.exports = { makeDb };
