// connectors/facebook.js
// Facebook Pages connector (M2). Ports, does not rewrite: the Graph calls
// live in server/fetchers/facebook.js (ESM) and are loaded via dynamic
// import from this CJS subtree, so there is exactly one Facebook client in
// the repo. The matching flow mirrors the syncFacebook route: posts are tied
// to properties through the user-pasted propiq.platform_links rows, because
// posts.property_id is NOT NULL — an unmatched Page post is never stored.
//
// Token strategy (M1 entry point 3): FB_ACCESS_TOKEN is a Facebook-login
// user token; when META_APP_ID/SECRET are present it is exchanged for a
// long-lived one for this run. The exchange is NOT persisted to .env — the
// framework does not edit files; the manual sync route already persists on
// its runs. Page tokens derived from a long-lived user token do not expire.
// A dead token surfaces as TokenExpiredError -> a 'token-expired' alert and
// a failed sync_runs row, never a silent retry loop.
//
// Deliberate difference from the route: platform_links.post_id placeholder
// reconciliation is left to the route (it is a UI concern, and a write, and
// connector writes are centralized in persistFetchResult).

const { ApiConnector } = require('../core/api-connector');
const { classifyMetaError } = require('./meta-shared');

class FacebookConnector extends ApiConnector {
  static slug = 'facebook';

  constructor(opts) {
    super({ ...opts, name: FacebookConnector.slug, sourceType: 'social' });
  }

  isConfigured() {
    return Boolean(this.config.FB_ACCESS_TOKEN);
  }

  async init() {
    // The server's proven fetcher, single source of truth. ESM from CJS via
    // dynamic import; the path is file-relative so CLI and embedded modes agree.
    this.fb = this.fb ?? (await import('../../../server/fetchers/facebook.js'));
  }

  async authenticate() {
    const { exchangeForLongLivedToken, resolvePage } = this.fb;
    let token = this.config.FB_ACCESS_TOKEN;
    const exchanged = await exchangeForLongLivedToken({
      token,
      appId: this.config.META_APP_ID,
      appSecret: this.config.META_APP_SECRET,
    });
    if (exchanged && exchanged !== token) {
      token = exchanged;
      this.log.info('exchanged for a long-lived user token (in-memory for this run)');
    }
    this.userToken = token;
    try {
      this.page = await resolvePage({ userToken: token, pageId: this.config.FB_PAGE_ID });
    } catch (err) {
      throw classifyMetaError(this.name, err);
    }
  }

  async fetchRaw() {
    const { fetchPagePosts, fetchPostInsights, facebookPostKey, facebookApiPostKeys } = this.fb;

    const links = await this.db.getPlatformLinks('facebook');
    const pagePosts = links.length
      ? await fetchPagePosts({ pageId: this.page.id, pageToken: this.page.pageToken })
      : [];

    const postsByKey = new Map();
    for (const p of pagePosts) {
      for (const key of facebookApiPostKeys(p)) postsByKey.set(key, p);
    }

    const matched = [];
    let unmatched = 0;
    const seen = new Set();
    for (const link of links) {
      const key = facebookPostKey(link.post_url);
      const post = key ? postsByKey.get(key) : null;
      if (!post) {
        unmatched++;
        continue;
      }
      if (seen.has(post.id)) continue; // two links to one post: store once
      seen.add(post.id);
      matched.push({ link, post });
    }

    // Insights only for matched posts — same economy as the route.
    for (const m of matched) {
      m.insights = await fetchPostInsights({ postId: m.post.id, pageToken: this.page.pageToken });
    }

    if (unmatched) this.log.warn(`${unmatched} facebook link(s) matched no Page post`);
    return { page: this.page, matched, unmatched };
  }

  map(raw) {
    const { page, matched } = raw;

    const accounts = [
      {
        platform: 'facebook',
        handle: page.name,
        external_id: String(page.id),
        followers: page.followers ?? null,
        media_count: null,
      },
    ];

    const posts = [];
    const socialMetrics = [];
    for (const { link, post, insights } of matched) {
      posts.push({
        platform: 'facebook',
        external_id: String(post.id),
        property_id: link.property_id,
        account_handle: page.name,
        posted_at: post.created_time ?? null,
        permalink: post.permalink_url ?? null,
        caption: post.message ?? null,
        media_type: null, // the Page posts endpoint does not carry a type field
        raw: {},
      });
      socialMetrics.push({
        platform: 'facebook',
        external_id: String(post.id),
        reach: insights.reach,
        views: insights.views,
        likes: post.likes?.summary?.total_count ?? null,
        comments: post.comments?.summary?.total_count ?? null,
        shares: post.shares?.count ?? null,
        saves: null, // Facebook exposes no saves metric for Page posts
        total_interactions: null,
        source: 'api',
        raw: {},
      });
    }

    return { accounts, posts, socialMetrics, listings: [], portalMetrics: [] };
  }
}

module.exports = { FacebookConnector };
