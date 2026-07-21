// smoke-test.js — no DB, no browser, no network.
// M1 checks: config parses, models validate, mapping errors are caught,
// unconfigured connectors report cleanly.
// M2 checks: the Facebook and Instagram connectors run END TO END through
// the manager against a stubbed global fetch (canned Graph payloads) and a
// fake pg pool that records every statement — asserting that writes hit the
// LIVE table names (posts, post_metrics, platform_accounts, account_metrics,
// sync_runs) and never the skeleton's social_posts/social_post_metrics
// (M1 open issue 1), and that a post without a property match is skipped
// rather than violating posts.property_id NOT NULL.
//   node services/connectors/smoke-test.js

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://smoke:test@localhost:6543/smoke';
process.env.FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN || 'EAAsmoketoken';
process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'IGsmoketoken';

const assert = require('node:assert');
const { config } = require('./core/config');
const { FetchResultModel, SocialMetricModel } = require('./core/models');
const { BaseConnector } = require('./core/base-connector');
const { ApiConnector } = require('./core/api-connector');
const { MappingError } = require('./core/errors');
const { createLogger } = require('./core/logger');
const { ConnectorManager } = require('./core/manager');
const { KedwellConnector } = require('./connectors/kedwell.stub');
const { FacebookConnector } = require('./connectors/facebook');
const { InstagramConnector } = require('./connectors/instagram');

const log = createLogger('smoke', 'info');

// ---------------------------------------------------------------- fake pool
// Answers the exact statements the db layer issues; records them all.
function makeFakePool({ links }) {
  const statements = [];
  let nextId = 100;
  return {
    statements,
    async query(text, params) {
      statements.push({ text, params });
      if (/FROM \w+\.platform_links/.test(text)) {
        return { rows: links.filter((l) => l.platform === params[0]) };
      }
      if (/INSERT INTO \w+\.sync_runs/.test(text)) return { rows: [{ id: nextId++ }] };
      if (/UPDATE \w+\.sync_runs/.test(text)) return { rows: [] };
      if (/INSERT INTO \w+\.platform_accounts/.test(text)) return { rows: [{ id: nextId++ }] };
      if (/INSERT INTO \w+\.account_metrics/.test(text)) return { rows: [] };
      if (/SELECT id FROM \w+\.posts/.test(text)) return { rows: [] }; // no pre-existing posts
      if (/INSERT INTO \w+\.posts/.test(text)) return { rows: [{ id: nextId++ }] };
      if (/INSERT INTO \w+\.post_metrics/.test(text)) return { rows: [] };
      throw new Error(`fake pool: unexpected statement: ${text.slice(0, 80)}`);
    },
  };
}

// ------------------------------------------------------------- fetch stubs
const json = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

function stubFetch(router) {
  global.fetch = async (url) => {
    const s = String(url);
    for (const [pattern, body] of router) {
      if (s.includes(pattern)) return json(typeof body === 'function' ? body(s) : body);
    }
    throw new Error(`stub fetch: no route for ${s}`);
  };
}

const FB_ROUTES = [
  ['oauth/access_token', { access_token: 'EAAlonglived' }],
  ['me/accounts', {
    data: [{ id: '111', name: 'Blue Falcon Real Estate', access_token: 'PAGETOKEN', followers_count: 5000 }],
  }],
  ['111/posts', {
    data: [
      {
        id: '111_222',
        message: 'Plainsview Estate Kitengela — 3BR bungalows',
        permalink_url: 'https://www.facebook.com/bluefalcon/posts/pfbid0MatchKey',
        created_time: '2026-07-20T08:00:00+0000',
        shares: { count: 3 },
        likes: { summary: { total_count: 40 } },
        comments: { summary: { total_count: 5 } },
      },
      {
        id: '111_333', // present on the Page but linked to no property: must be skipped
        message: 'Office housekeeping post',
        permalink_url: 'https://www.facebook.com/bluefalcon/posts/pfbid0NoLink',
        created_time: '2026-07-19T08:00:00+0000',
      },
    ],
  }],
  ['111_222/insights', {
    data: [
      { name: 'post_impressions', values: [{ value: 900 }] },
      { name: 'post_impressions_unique', values: [{ value: 700 }] },
    ],
  }],
];

const IG_ROUTES = [
  ['graph.instagram.com/v23.0/me/media', {
    data: [{
      id: '9001',
      caption: 'Emayian Residences Laiser Hill',
      permalink: 'https://www.instagram.com/p/AbCdEf123/',
      timestamp: '2026-07-18T10:00:00+0000',
      media_type: 'IMAGE',
      like_count: 88,
      comments_count: 12,
    }],
  }],
  ['9001/insights', {
    data: [
      { name: 'reach', values: [{ value: 1500 }] },
      { name: 'views', values: [{ value: 2100 }] },
      { name: 'saved', values: [{ value: 9 }] },
      { name: 'shares', values: [{ value: 4 }] },
      { name: 'total_interactions', values: [{ value: 113 }] },
    ],
  }],
  // IG-login token: account header is /me on graph.instagram.com
  ['graph.instagram.com/v23.0/me', {
    user_id: '17840000000000000', username: 'bluefalconreal', followers_count: 3200, media_count: 60,
  }],
];

(async () => {
  // 1. Config parsed with defaults
  assert.equal(config.DB_SCHEMA, 'propiq');
  assert.equal(typeof config.CONNECTOR_HEADLESS, 'boolean');
  log.info('config OK');

  // 2. Models: append-per-capture social metric (no metric_date), source enum
  const m = SocialMetricModel.parse({ platform: 'facebook', external_id: '123', views: 10 });
  assert.equal(m.source, 'api');
  assert.throws(() => SocialMetricModel.parse({ platform: 'facebook', external_id: '123', source: 'scrape' }));
  log.info('models OK');

  // 3. BaseConnector cannot be instantiated directly
  assert.throws(() => new BaseConnector({ name: 'x', sourceType: 'social', config, logger: log }));
  log.info('abstract guard OK');

  // 4. A connector whose map() returns garbage fails with MappingError
  class BadMapper extends ApiConnector {
    static slug = 'badmapper';
    constructor(o) { super({ ...o, name: 'badmapper', sourceType: 'social' }); }
    isConfigured() { return true; }
    async authenticate() {}
    async fetchRaw() { return {}; }
    map() { return { socialMetrics: [{ platform: 'x' /* missing external_id */ }] }; }
  }
  await assert.rejects(
    () => new BadMapper({ config, logger: log }).run(new Date()),
    (e) => e instanceof MappingError
  );
  log.info('mapping validation OK');

  // 5. A well-formed empty result passes
  class EmptyOk extends ApiConnector {
    static slug = 'emptyok';
    constructor(o) { super({ ...o, name: 'emptyok', sourceType: 'social' }); }
    isConfigured() { return true; }
    async authenticate() {}
    async fetchRaw() { return {}; }
    map() { return {}; }
  }
  FetchResultModel.parse(await new EmptyOk({ config, logger: log }).run(new Date()));
  log.info('lifecycle OK');

  // 6. Kedwell stub reports unconfigured (no credentials in env)
  assert.equal(new KedwellConnector({ config, logger: log }).isConfigured(), false);
  log.info('stub skip behavior OK');

  // 7. isConfigured logic for the Meta pair
  assert.equal(new FacebookConnector({ config, logger: log }).isConfigured(), true);
  assert.equal(new InstagramConnector({ config, logger: log }).isConfigured(), true); // IG-prefix token
  {
    const eaaCfg = { ...config, META_ACCESS_TOKEN: 'EAAneedsid', IG_USER_ID: undefined };
    assert.equal(new InstagramConnector({ config: eaaCfg, logger: log }).isConfigured(), false);
  }
  log.info('isConfigured OK');

  // 8. Facebook end to end: manager -> connector -> fake Graph -> fake pool
  {
    stubFetch(FB_ROUTES);
    const pool = makeFakePool({
      links: [
        { platform: 'facebook', id: 1, property_id: 7, post_url: 'https://www.facebook.com/bluefalcon/posts/pfbid0MatchKey' },
      ],
    });
    const manager = new ConnectorManager({ config, pool });
    manager.register(FacebookConnector);
    const result = await manager.runOne('facebook');
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.deepEqual(
      { accounts: result.counts.accounts, posts: result.counts.posts, postMetrics: result.counts.postMetrics },
      { accounts: 1, posts: 1, postMetrics: 1 }
    );
    const sql = pool.statements.map((s) => s.text).join('\n');
    assert.match(sql, /INSERT INTO propiq\.posts/);
    assert.match(sql, /INSERT INTO propiq\.post_metrics/);
    assert.match(sql, /INSERT INTO propiq\.platform_accounts/);
    assert.match(sql, /INSERT INTO propiq\.account_metrics/);
    assert.doesNotMatch(sql, /social_posts|social_post_metrics/); // M1 open issue 1 closed
    const metricInsert = pool.statements.find((s) => /INSERT INTO propiq\.post_metrics/.test(s.text));
    assert.deepEqual(metricInsert.params.slice(1, 6), [700, 900, 40, 5, 3]); // reach, views, likes, comments, shares
  }
  log.info('facebook connector OK');

  // 9. Facebook: a post with no property link is never written (NOT NULL guard)
  {
    stubFetch(FB_ROUTES);
    const pool = makeFakePool({ links: [{ platform: 'facebook', id: 1, property_id: 7, post_url: 'https://www.facebook.com/x/posts/pfbid0Different' }] });
    const manager = new ConnectorManager({ config, pool });
    manager.register(FacebookConnector);
    const result = await manager.runOne('facebook');
    assert.equal(result.status, 'success');
    assert.equal(result.counts.posts, 0);
    assert.doesNotMatch(pool.statements.map((s) => s.text).join('\n'), /INSERT INTO propiq\.posts/);
  }
  log.info('facebook unmatched-link guard OK');

  // 10. Instagram end to end (IG-login token flavor)
  {
    stubFetch(IG_ROUTES);
    const pool = makeFakePool({
      links: [{ platform: 'instagram', id: 2, property_id: 9, post_url: 'https://www.instagram.com/p/AbCdEf123/?igsh=share' }],
    });
    const manager = new ConnectorManager({ config, pool });
    manager.register(InstagramConnector);
    const result = await manager.runOne('instagram');
    assert.equal(result.status, 'success', JSON.stringify(result));
    assert.deepEqual(
      { accounts: result.counts.accounts, posts: result.counts.posts, postMetrics: result.counts.postMetrics },
      { accounts: 1, posts: 1, postMetrics: 1 }
    );
    const metricInsert = pool.statements.find((s) => /INSERT INTO propiq\.post_metrics/.test(s.text));
    // reach, views, likes, comments, shares, saves, total_interactions
    assert.deepEqual(metricInsert.params.slice(1, 8), [1500, 2100, 88, 12, 4, 9, 113]);
    const postInsert = pool.statements.find((s) => /INSERT INTO propiq\.posts/.test(s.text));
    assert.equal(postInsert.params[0], 9); // property_id from the link
  }
  log.info('instagram connector OK');

  log.info('ALL SMOKE TESTS PASSED');
})().catch((err) => {
  log.error('SMOKE TEST FAILED', err);
  process.exit(1);
});
