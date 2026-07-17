// connectors/kedwell.stub.js
// Stub connector — the M3 pattern for portals that exist but aren't active yet.
// Kedwell is on trial with no credentials configured, so isConfigured() returns
// false until KEDWELL_EMAIL/KEDWELL_PASSWORD land in .env; the manager records
// 'skipped' rather than 'failed'. When Kedwell is confirmed, this file becomes
// a real BrowserConnector: implement isSessionValid, performLogin, fetchRaw, map.

const { BrowserConnector } = require('../core/browser-connector');

class KedwellConnector extends BrowserConnector {
  static slug = 'kedwell';

  constructor(opts) {
    super({ ...opts, name: KedwellConnector.slug, sourceType: 'portal' });
  }

  isConfigured() {
    return Boolean(this.config.KEDWELL_EMAIL && this.config.KEDWELL_PASSWORD);
  }

  async performLogin() {
    throw new Error('kedwell: connector scaffolded but not implemented — activate in M3');
  }

  async fetchRaw() {
    throw new Error('kedwell: connector scaffolded but not implemented — activate in M3');
  }

  map() {
    return { posts: [], socialMetrics: [], listings: [], portalMetrics: [] };
  }
}

module.exports = { KedwellConnector };
