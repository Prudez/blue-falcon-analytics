// core/api-connector.js
// Base for HTTP-API connectors (Meta in M2; X if it ever justifies its tier).
// Provides fetch-with-retry, rate-limit awareness, and token health checks.

const { BaseConnector } = require('./base-connector');
const { TransientError, RateLimitError, AuthError } = require('./errors');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ApiConnector extends BaseConnector {
  constructor(opts) {
    super(opts);
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 1000;
  }

  /**
   * HTTP GET/POST with retry on transient failures and rate limits.
   * Auth failures are never retried — they surface immediately.
   */
  async request(url, init = {}) {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt++;
      let res;
      try {
        res = await fetch(url, init);
      } catch (err) {
        if (attempt > this.maxRetries) {
          throw new TransientError(`${this.name}: network failure after ${attempt} attempts`, {
            connector: this.name,
            cause: err,
          });
        }
        await sleep(this.baseBackoffMs * 2 ** (attempt - 1));
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        const body = await res.text().catch(() => '');
        throw new AuthError(`${this.name}: auth rejected (HTTP ${res.status})`, {
          connector: this.name,
          cause: body.slice(0, 500),
        });
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        const waitMs = retryAfter ? retryAfter * 1000 : this.baseBackoffMs * 2 ** attempt;
        if (attempt > this.maxRetries) {
          throw new RateLimitError(`${this.name}: rate limited after ${attempt} attempts`, {
            connector: this.name,
            retryAfterMs: waitMs,
          });
        }
        this.log.warn(`rate limited; waiting ${waitMs}ms (attempt ${attempt})`);
        await sleep(waitMs);
        continue;
      }

      if (res.status >= 500) {
        if (attempt > this.maxRetries) {
          throw new TransientError(`${this.name}: upstream ${res.status} after ${attempt} attempts`, {
            connector: this.name,
          });
        }
        await sleep(this.baseBackoffMs * 2 ** (attempt - 1));
        continue;
      }

      return res;
    }
  }

  /**
   * Token health check. Subclasses (Meta) override with real expiry inspection
   * and throw TokenExpiredError when a manual re-auth is required. The manager
   * turns that into an alert, never a retry loop.
   */
  async checkTokenHealth() {
    return { ok: true };
  }
}

module.exports = { ApiConnector };
