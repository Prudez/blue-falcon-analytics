// connectors/instagram.js
// Instagram connector (M2). Ports server/fetchers/instagram.js (ESM) via
// dynamic import — one Instagram client in the repo. The fetcher already
// carries the Phase 3 corrections: `views` not the deprecated `impressions`,
// and post ids are never derived from URL shortcodes; the account's own
// media list is matched against stored platform_links permalinks and only
// the API's media id is trusted.
//
// Token flavors, auto-detected by the fetcher:
//   "IG..."  – Instagram-business-login token: the account is /me, no id needed.
//   "EAA..." – Facebook-login token: the numeric IG_USER_ID must be set.
// isConfigured() encodes exactly that rule, so a half-configured .env reads
// as 'skipped', not as a failed run.

const { ApiConnector } = require('../core/api-connector');
const { classifyMetaError } = require('./meta-shared');

class InstagramConnector extends ApiConnector {
  static slug = 'instagram';

  constructor(opts) {
    super({ ...opts, name: InstagramConnector.slug, sourceType: 'social' });
  }

  isConfigured() {
    const token = this.config.META_ACCESS_TOKEN;
    if (!token) return false;
    if (token.startsWith('IG')) return true; // /me addressing, no id required
    return Boolean(this.config.IG_USER_ID && this.config.IG_USER_ID !== '0');
  }

  async init() {
    this.ig = this.ig ?? (await import('../../../server/fetchers/instagram.js'));
    this.creds = {
      igUserId: this.config.IG_USER_ID,
      accessToken: this.config.META_ACCESS_TOKEN,
    };
  }

  async authenticate() {
    try {
      this.account = await this.ig.fetchAccount(this.creds);
    } catch (err) {
      throw classifyMetaError(this.name, err);
    }
  }

  async fetchRaw() {
    const { fetchMedia, fetchInsights, permalinkCode } = this.ig;

    const links = await this.db.getPlatformLinks('instagram');
    const media = links.length ? await fetchMedia(this.creds) : [];

    const mediaByCode = new Map();
    for (const m of media) {
      const code = permalinkCode(m.permalink);
      if (code) mediaByCode.set(code, m);
    }

    const matched = [];
    let unmatched = 0;
    const seen = new Set();
    for (const link of links) {
      const code = permalinkCode(link.post_url);
      const m = code ? mediaByCode.get(code) : null;
      if (!m) {
        unmatched++;
        continue;
      }
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      matched.push({ link, media: m });
    }

    for (const item of matched) {
      item.insights = await fetchInsights({
        mediaId: item.media.id,
        accessToken: this.creds.accessToken,
      });
    }

    if (unmatched) this.log.warn(`${unmatched} instagram link(s) matched no media`);
    return { account: this.account, matched, unmatched };
  }

  map(raw) {
    const { account, matched } = raw;

    const accounts = [
      {
        platform: 'instagram',
        handle: account.username,
        external_id: String(account.id),
        followers: account.followers ?? null,
        media_count: account.mediaCount ?? null,
      },
    ];

    const posts = [];
    const socialMetrics = [];
    for (const { link, media, insights } of matched) {
      posts.push({
        platform: 'instagram',
        external_id: String(media.id),
        property_id: link.property_id,
        account_handle: account.username,
        posted_at: media.timestamp ?? null,
        permalink: media.permalink ?? null,
        caption: media.caption ?? null,
        media_type: media.media_type ?? null,
        raw: {},
      });
      socialMetrics.push({
        platform: 'instagram',
        external_id: String(media.id),
        reach: insights.reach,
        views: insights.views, // v22.0+: 'views'; 'impressions' is deprecated
        likes: media.like_count ?? null,
        comments: media.comments_count ?? null,
        shares: insights.shares,
        saves: insights.saves,
        total_interactions: insights.totalInteractions,
        source: 'api',
        raw: {},
      });
    }

    return { accounts, posts, socialMetrics, listings: [], portalMetrics: [] };
  }
}

module.exports = { InstagramConnector };
