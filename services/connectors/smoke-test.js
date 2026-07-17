// smoke-test.js — no DB, no browser, no network.
// Verifies: config parses, models validate, mapping errors are caught,
// unconfigured connectors report cleanly.
//   node services/connectors/smoke-test.js

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://smoke:test@localhost:6543/smoke';

const assert = require('node:assert');
const { config } = require('./core/config');
const { FetchResultModel, SocialMetricModel } = require('./core/models');
const { BaseConnector } = require('./core/base-connector');
const { ApiConnector } = require('./core/api-connector');
const { MappingError } = require('./core/errors');
const { createLogger } = require('./core/logger');
const { KedwellConnector } = require('./connectors/kedwell.stub');

const log = createLogger('smoke', 'info');

(async () => {
  // 1. Config parsed with defaults
  assert.equal(config.DB_SCHEMA, 'propiq');
  assert.equal(typeof config.CONNECTOR_HEADLESS, 'boolean');
  log.info('config OK');

  // 2. Models accept a valid metric, reject a bad date
  SocialMetricModel.parse({ platform: 'facebook', external_id: '123', metric_date: '2026-07-17' });
  assert.throws(() => SocialMetricModel.parse({ platform: 'facebook', external_id: '123', metric_date: '17/07/2026' }));
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
    map() { return { socialMetrics: [{ platform: 'x' /* missing fields */ }] }; }
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
    map() { return { posts: [], socialMetrics: [], listings: [], portalMetrics: [] }; }
  }
  const result = await new EmptyOk({ config, logger: log }).run(new Date());
  FetchResultModel.parse(result);
  log.info('lifecycle OK');

  // 6. Kedwell stub reports unconfigured (no credentials in env)
  const kedwell = new KedwellConnector({ config, logger: log });
  assert.equal(kedwell.isConfigured(), false);
  log.info('stub skip behavior OK');

  log.info('ALL SMOKE TESTS PASSED');
})().catch((err) => {
  log.error('SMOKE TEST FAILED', err);
  process.exit(1);
});
