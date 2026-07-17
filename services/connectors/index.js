// services/connectors/index.js
// Entry point. Two usage modes:
//
// 1) Embedded in the Express app (preferred — reuses the pg pool):
//      const { buildManager, mountRoutes } = require('./services/connectors');
//      const manager = buildManager({ pool });
//      mountRoutes(app, manager);           // POST /api/connectors/run[/:name]
//
// 2) Standalone one-off (PowerShell):
//      node services/connectors/index.js           # run all
//      node services/connectors/index.js kedwell   # run one

const { config } = require('./core/config');
const { ConnectorManager } = require('./core/manager');
const { KedwellConnector } = require('./connectors/kedwell.stub');

// M2/M3 connectors get registered here as they land:
// const { FacebookConnector } = require('./connectors/facebook');
// const { InstagramConnector } = require('./connectors/instagram');
// const { TikTokConnector } = require('./connectors/tiktok');
// const { BuyRentKenyaConnector } = require('./connectors/buyrentkenya');
// const { Property24Connector } = require('./connectors/property24');

function buildManager({ pool, onAlert } = {}) {
  const manager = new ConnectorManager({ config, pool, onAlert });
  manager.register(KedwellConnector);
  // .register(FacebookConnector)
  // .register(InstagramConnector)
  // ...
  return manager;
}

/** Manual trigger routes for testing/backfills. Add auth middleware before prod. */
function mountRoutes(app, manager) {
  app.post('/api/connectors/run', async (_req, res) => {
    const results = await manager.runAll();
    res.json({ results });
  });

  app.post('/api/connectors/run/:name', async (req, res) => {
    const result = await manager.runOne(req.params.name);
    const code = result.status === 'unknown' ? 404 : 200;
    res.status(code).json(result);
  });
}

module.exports = { buildManager, mountRoutes };

// Standalone mode
if (require.main === module) {
  (async () => {
    const manager = buildManager({});
    const target = process.argv[2];
    const results = target ? [await manager.runOne(target)] : await manager.runAll();
    console.table(results.map(({ name, status, error }) => ({ name, status, error: error ?? '' })));
    await manager.db.pool.end();
    process.exit(results.some((r) => r.status === 'failed') ? 1 : 0);
  })();
}
