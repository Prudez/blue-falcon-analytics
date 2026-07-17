// core/manager.js
// Registers connectors, runs them SEQUENTIALLY (one Chromium at a time — no
// parallel Playwright pile-ups), isolates failures per connector, and writes
// every run to sync_runs. One dead selector must not kill the whole sync.

const { makeDb } = require('./db');
const { createLogger } = require('./logger');
const { TokenExpiredError, AuthError, SelectorError } = require('./errors');

class ConnectorManager {
  /**
   * @param {object} opts
   * @param {object} opts.config          – validated env
   * @param {object} [opts.pool]          – existing pg pool to reuse (Express app)
   * @param {function} [opts.onAlert]     – called with { connector, kind, message } for
   *                                        conditions needing a human (token re-auth, login failure)
   */
  constructor({ config, pool, onAlert } = {}) {
    this.config = config;
    this.db = makeDb(pool);
    this.log = createLogger('connectors', config.CONNECTOR_LOG_LEVEL);
    this.onAlert = onAlert || ((a) => this.log.warn(`ALERT [${a.connector}] ${a.kind}: ${a.message}`));
    this.registry = new Map();
  }

  /** @param {Function} ConnectorClass – class extending Api/BrowserConnector */
  register(ConnectorClass) {
    const instance = new ConnectorClass({
      config: this.config,
      logger: this.log.child(ConnectorClass.slug),
    });
    this.registry.set(instance.name, instance);
    return this;
  }

  get connectors() {
    return [...this.registry.values()];
  }

  sinceDate() {
    const d = new Date();
    d.setDate(d.getDate() - this.config.CONNECTOR_REFRESH_DAYS);
    return d;
  }

  /** Run one connector end-to-end with audit trail. Never throws. */
  async runOne(name) {
    const c = this.registry.get(name);
    if (!c) return { name, status: 'unknown', error: `no connector registered as '${name}'` };

    if (!c.isConfigured()) {
      const runId = await this.db.startRun(c.name, c.sourceType);
      await this.db.finishRun(runId, 'skipped', 'credentials not configured');
      this.log.info(`${c.name}: skipped (not configured)`);
      return { name: c.name, status: 'skipped' };
    }

    const runId = await this.db.startRun(c.name, c.sourceType);
    try {
      await c.init();
      await c.authenticate();
      if (typeof c.checkTokenHealth === 'function') {
        await c.checkTokenHealth();
      }
      const result = await c.run(this.sinceDate());
      const counts = await this.db.persistFetchResult(result);
      await this.db.finishRun(runId, 'success', null, counts);
      this.log.info(`${c.name}: success`, counts);
      return { name: c.name, status: 'success', counts };
    } catch (err) {
      const detail = `${err.name}: ${err.message}`;
      await this.db.finishRun(runId, 'failed', detail);
      this.log.error(`${c.name}: failed — ${detail}`);

      if (err instanceof TokenExpiredError) {
        this.onAlert({ connector: c.name, kind: 'token-expired', message: 'Manual re-auth required.' });
      } else if (err instanceof AuthError) {
        this.onAlert({ connector: c.name, kind: 'auth-failed', message: 'Login rejected. Check credentials; do not retry automatically.' });
      } else if (err instanceof SelectorError) {
        this.onAlert({
          connector: c.name,
          kind: 'selector-broken',
          message: `DOM changed. Snapshot: ${err.snapshotPath || 'n/a'}`,
        });
      }
      return { name: c.name, status: 'failed', error: detail };
    } finally {
      await c.dispose().catch(() => {});
    }
  }

  /** Run all registered connectors sequentially. */
  async runAll() {
    const results = [];
    for (const c of this.connectors) {
      results.push(await this.runOne(c.name));
    }
    return results;
  }
}

module.exports = { ConnectorManager };
