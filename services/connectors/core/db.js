// core/db.js
// Pooled pg access + write helpers against the LIVE schema (M1 open issue 1).
// Targets the tables migrations 004/005/007 actually created: posts,
// post_metrics, platform_accounts, account_metrics, portals (code),
// portal_listings, portal_listing_metrics, plus the unified sync_runs from
// sql/001. This file adds no schema, it writes to it.
//
// Write semantics follow the live app, not the skill skeleton:
//   - platform_accounts upserts on (platform, handle); account_metrics appends.
//   - posts upserts on (platform, external_post_id). property_id is NOT NULL
//     in the live table, so a post without a property match is only stored if
//     a row for it already exists; otherwise it is skipped and counted.
//   - post_metrics APPENDS one row per capture (captured_at DEFAULT now()),
//     exactly like the manual sync routes. No daily upsert exists for social.
//   - portal_listing_metrics UPSERTS on 005's per-UTC-day expression index,
//     because scrapers re-run within a day and must overwrite, not duplicate.

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
    schema: S,

    /** Read-only escape hatch for connectors (e.g. platform_links matching). */
    query: q,

    /** The user-pasted post links that tie posts to properties. */
    async getPlatformLinks(platform) {
      const { rows } = await q(
        `SELECT id, property_id, post_url FROM ${S}.platform_links WHERE platform = $1`,
        [platform]
      );
      return rows;
    },

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

    // ---- accounts --------------------------------------------------------
    async upsertPlatformAccount(a) {
      const { rows } = await q(
        `INSERT INTO ${S}.platform_accounts (platform, handle, external_id, last_synced_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (platform, handle)
         DO UPDATE SET external_id = COALESCE(EXCLUDED.external_id, ${S}.platform_accounts.external_id),
                       last_synced_at = now()
         RETURNING id`,
        [a.platform, a.handle, a.external_id]
      );
      return rows[0].id;
    },

    async insertAccountMetric(accountId, a) {
      await q(
        `INSERT INTO ${S}.account_metrics (platform_account_id, followers, media_count)
         VALUES ($1, $2, $3)`,
        [accountId, a.followers, a.media_count]
      );
    },

    // ---- social ----------------------------------------------------------
    /**
     * Upsert a post. Returns the post id, or null when the post has no
     * property_id and no row exists yet (posts.property_id is NOT NULL, so
     * there is nothing valid to insert — the caller counts it as skipped).
     */
    async upsertPost(p, platformAccountId = null) {
      if (p.property_id == null) {
        const { rows } = await q(
          `SELECT id FROM ${S}.posts WHERE platform = $1 AND external_post_id = $2`,
          [p.platform, p.external_id]
        );
        return rows.length ? rows[0].id : null;
      }
      const { rows } = await q(
        `INSERT INTO ${S}.posts
           (property_id, platform_account_id, platform, external_post_id,
            permalink, caption, media_type, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (platform, external_post_id)
         DO UPDATE SET caption = COALESCE(EXCLUDED.caption, ${S}.posts.caption),
                       permalink = COALESCE(EXCLUDED.permalink, ${S}.posts.permalink),
                       media_type = COALESCE(EXCLUDED.media_type, ${S}.posts.media_type)
         RETURNING id`,
        [
          p.property_id,
          platformAccountId,
          p.platform,
          p.external_id,
          p.permalink,
          p.caption,
          p.media_type,
          p.posted_at,
        ]
      );
      return rows[0].id;
    },

    /** Append one capture. Mirrors the manual sync routes: plain INSERT. */
    async insertPostMetric(postId, m) {
      await q(
        `INSERT INTO ${S}.post_metrics
           (post_id, reach, views, likes, comments, shares, saves, total_interactions, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          postId, m.reach, m.views, m.likes, m.comments,
          m.shares, m.saves, m.total_interactions, m.source,
        ]
      );
    },

    // ---- portals ---------------------------------------------------------
    async getPortalId(code) {
      const { rows } = await q(`SELECT id FROM ${S}.portals WHERE code = $1`, [code]);
      if (!rows.length) throw new Error(`Portal '${code}' has no row in ${S}.portals`);
      return rows[0].id;
    },

    async upsertPortalListing(portalId, l) {
      const { rows } = await q(
        `INSERT INTO ${S}.portal_listings (portal_id, external_id, property_id, title, url, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (portal_id, external_id) DO UPDATE SET
           property_id = COALESCE(EXCLUDED.property_id, ${S}.portal_listings.property_id),
           title  = COALESCE(EXCLUDED.title, ${S}.portal_listings.title),
           url    = COALESCE(EXCLUDED.url, ${S}.portal_listings.url),
           status = COALESCE(EXCLUDED.status, ${S}.portal_listings.status)
         RETURNING id`,
        [portalId, l.external_id, l.property_id ?? null, l.title ?? null, l.url ?? null, l.status ?? null]
      );
      return rows[0].id;
    },

    /** Same-UTC-day re-runs overwrite via 005's expression index. */
    async upsertPortalMetric(listingId, m) {
      await q(
        `INSERT INTO ${S}.portal_listing_metrics
           (portal_listing_id, views, saves, contact_clicks,
            phone_reveals, whatsapp_clicks, inquiries, source, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (portal_listing_id, ((captured_at AT TIME ZONE 'UTC')::date))
         DO UPDATE SET views = EXCLUDED.views, saves = EXCLUDED.saves,
           contact_clicks = EXCLUDED.contact_clicks, phone_reveals = EXCLUDED.phone_reveals,
           whatsapp_clicks = EXCLUDED.whatsapp_clicks, inquiries = EXCLUDED.inquiries,
           source = EXCLUDED.source, raw = EXCLUDED.raw`,
        [
          listingId, m.views, m.saves, m.contact_clicks,
          m.phone_reveals, m.whatsapp_clicks, m.inquiries,
          m.source, m.raw ? JSON.stringify(m.raw) : null,
        ]
      );
    },

    // ---- one entry point the manager calls with a validated FetchResult --
    async persistFetchResult(result) {
      const counts = {
        accounts: 0, posts: 0, postsSkipped: 0,
        postMetrics: 0, postMetricsSkipped: 0,
        listings: 0, portalMetrics: 0,
      };

      // Accounts first, so posts can reference platform_account_id.
      const accountIds = new Map(); // `${platform}:${handle}` -> id
      for (const a of result.accounts) {
        const id = await this.upsertPlatformAccount(a);
        accountIds.set(`${a.platform}:${a.handle}`, id);
        if (a.followers != null || a.media_count != null) {
          await this.insertAccountMetric(id, a);
        }
        counts.accounts++;
      }

      const postIds = new Map(); // `${platform}:${external_id}` -> id
      for (const p of result.posts) {
        const accountId = p.account_handle
          ? accountIds.get(`${p.platform}:${p.account_handle}`) ?? null
          : null;
        const id = await this.upsertPost(p, accountId);
        if (id == null) {
          counts.postsSkipped++; // no property match and no existing row
          continue;
        }
        postIds.set(`${p.platform}:${p.external_id}`, id);
        counts.posts++;
      }

      for (const m of result.socialMetrics) {
        let id = postIds.get(`${m.platform}:${m.external_id}`);
        if (!id) {
          // Metric for a post outside this batch: only usable if the post
          // already exists. posts.property_id is NOT NULL, so no shell rows.
          const { rows } = await q(
            `SELECT id FROM ${S}.posts WHERE platform = $1 AND external_post_id = $2`,
            [m.platform, m.external_id]
          );
          if (!rows.length) {
            counts.postMetricsSkipped++;
            continue;
          }
          id = rows[0].id;
        }
        await this.insertPostMetric(id, m);
        counts.postMetrics++;
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
            external_id: m.external_id, property_id: null, title: null, url: null, status: null,
          });
          listingIds.set(`${m.portal}:${m.external_id}`, id);
        }
        await this.upsertPortalMetric(id, m);
        counts.portalMetrics++;
      }

      return counts;
    },
  };
}

module.exports = { makeDb };
