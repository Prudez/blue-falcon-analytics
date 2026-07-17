// core/browser-connector.js
// Base for Playwright connectors (TikTok Studio, BuyRentKenya, Property24, Kedwell).
// Encapsulates: persistent context per connector, cookie/session reuse so login
// happens rarely, polite pacing, and page-snapshot capture for selector debugging.
//
// House rules baked in (portal-sync skill):
// - Own account, normal UI only. No public scraping, no bypasses.
// - Login failure is terminal for the run; never hot-loop login retries.
// - Prefer role/text selectors; snapshot the page HTML into `raw` on success
//   and to disk on selector failure, so future breakage has a diff target.

const fs = require('fs');
const path = require('path');
const { BaseConnector } = require('./base-connector');
const { AuthError, SelectorError } = require('./errors');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class BrowserConnector extends BaseConnector {
  constructor(opts) {
    super(opts);
    this.headless = opts.config.CONNECTOR_HEADLESS;
    this.storageDir = path.join(opts.config.CONNECTOR_STORAGE_DIR, this.name);
    this.pageDelayMs = opts.pageDelayMs ?? 750; // pacing between per-listing loads
    this.context = null;
    this.page = null;
  }

  async init() {
    // playwright is required lazily so API-only deployments don't need it installed.
    const { chromium } = require('playwright');
    fs.mkdirSync(this.storageDir, { recursive: true });
    this.context = await chromium.launchPersistentContext(this.storageDir, {
      headless: this.headless,
      viewport: { width: 1366, height: 900 },
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(20_000);
  }

  /** True when a stored session is still valid. Subclasses check a
   *  logged-in-only element on a cheap page. Default: assume not. */
  async isSessionValid() {
    return false;
  }

  /** Perform the actual login form flow. Subclasses implement. */
  async performLogin() {
    throw new Error(`${this.name}: performLogin() not implemented`);
  }

  /** Reuses the persisted session when valid; logs in once when not.
   *  A failed login throws AuthError and is NOT retried. */
  async authenticate() {
    if (await this.isSessionValid()) {
      this.log.info('session still valid; skipping login');
      return;
    }
    this.log.info('session expired or absent; performing login');
    try {
      await this.performLogin();
    } catch (err) {
      if (err instanceof AuthError) throw err;
      throw new AuthError(`${this.name}: login flow failed`, { connector: this.name, cause: err });
    }
  }

  /** Wrap selector-dependent steps so failures capture a snapshot for diffing. */
  async withSelectorGuard(label, fn) {
    try {
      return await fn();
    } catch (err) {
      const snapshotPath = await this.snapshotPage(`selector-fail-${label}`);
      throw new SelectorError(`${this.name}: selector step '${label}' failed`, {
        connector: this.name,
        cause: err,
        snapshotPath,
      });
    }
  }

  /** Save current page HTML to the storage dir; returns the path (or null). */
  async snapshotPage(tag) {
    try {
      const html = await this.page.content();
      const file = path.join(this.storageDir, `${Date.now()}-${tag}.html`);
      fs.writeFileSync(file, html, 'utf8');
      return file;
    } catch {
      return null;
    }
  }

  /** Polite pause between navigations. */
  async pace() {
    await sleep(this.pageDelayMs);
  }

  async dispose() {
    try {
      if (this.context) await this.context.close();
    } catch (err) {
      this.log.warn('error closing browser context', err?.message);
    } finally {
      this.context = null;
      this.page = null;
    }
  }
}

module.exports = { BrowserConnector };
