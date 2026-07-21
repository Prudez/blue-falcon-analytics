// core/base-connector.js
// Abstract lifecycle every connector follows:
//   isConfigured -> init -> authenticate -> fetch -> map -> dispose
// Subclass ApiConnector or BrowserConnector, not this directly.

const { FetchResultModel } = require('./models');
const { MappingError } = require('./errors');

class BaseConnector {
  /**
   * @param {object} opts
   * @param {string} opts.name       – unique slug, e.g. 'facebook', 'buyrentkenya'
   * @param {'social'|'portal'} opts.sourceType
   * @param {object} opts.config     – validated env object from core/config
   * @param {object} opts.logger     – child logger for this connector
   * @param {object} [opts.db]       – db layer from core/db, injected by the
   *   manager. READ-ONLY use inside connectors (e.g. getPlatformLinks to
   *   match posts to properties). All writes stay in persistFetchResult.
   */
  constructor({ name, sourceType, config, logger, db }) {
    if (new.target === BaseConnector) {
      throw new Error('BaseConnector is abstract; extend ApiConnector or BrowserConnector');
    }
    this.name = name;
    this.sourceType = sourceType;
    this.config = config;
    this.log = logger;
    this.db = db ?? null;
  }

  /** Return true when this connector has everything it needs to run.
   *  Missing credentials => false => manager records 'skipped', not 'failed'. */
  isConfigured() {
    throw new Error(`${this.name}: isConfigured() not implemented`);
  }

  /** Acquire resources (HTTP client, browser context). Optional. */
  async init() {}

  /** Establish an authenticated session. Throw AuthError / TokenExpiredError on failure. */
  async authenticate() {
    throw new Error(`${this.name}: authenticate() not implemented`);
  }

  /** Pull raw data since `since` (Date). Return anything; map() normalizes it. */
  async fetchRaw(since) {
    throw new Error(`${this.name}: fetchRaw() not implemented`);
  }

  /** Map raw platform data to the common models. Must return a FetchResult-shaped object.
   *  This is the ONLY place external field churn (impressions->views etc.) is handled. */
  map(raw) {
    throw new Error(`${this.name}: map() not implemented`);
  }

  /** Release resources (close browser context etc.). Must be idempotent. */
  async dispose() {}

  /** Template method the manager calls. Validates the mapped output so a
   *  mapping bug fails loudly here, not as a silent bad row downstream. */
  async run(since) {
    const raw = await this.fetchRaw(since);
    const mapped = this.map(raw);
    const parsed = FetchResultModel.safeParse(mapped);
    if (!parsed.success) {
      throw new MappingError(`${this.name}: mapped output failed model validation`, {
        connector: this.name,
        issues: parsed.error.issues,
      });
    }
    return parsed.data;
  }
}

module.exports = { BaseConnector };
