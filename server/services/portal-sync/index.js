// server/services/portal-sync/index.js
//
// Service entry for portal-sync: the registry of portal modules, the
// manual/cron trigger (runPortalSync), and the scheduler (startPortalCron).
//
// The wider app has no background scheduler today — every other sync is a
// manual POST. So the cron here is OFF by default and only arms when
// PORTAL_SYNC_ENABLED=true. That keeps it dormant until migration 005 is
// applied live (its tables must exist before a run can write), while the
// manual POST /api/portal-sync/run route works the moment the tables are
// there. Flip PORTAL_SYNC_ENABLED on once 005 is applied.

import cron from "node-cron";
import { env } from "../../env.js";
import { syncAll } from "./core/sync.js";
import buyrentkenya from "./portals/buyrentkenya.js";
import property24 from "./portals/property24.js";
import kedwell from "./portals/kedwell.js";

// Every portal seeded by migration 005 has a module here. A portal whose
// credentials are absent is reported as skipped, not run.
export const portals = [buyrentkenya, property24, kedwell];

// Runs one sync pass across all portals. `trigger` is recorded on each
// portal_sync_runs row: 'manual' from the route, 'cron' from the scheduler.
export async function runPortalSync(trigger = "manual") {
  return syncAll(portals, env, { trigger });
}

// Arms the daily cron when enabled. Returns the scheduled task, or null
// when disabled or misconfigured, so the caller can log which happened.
export function startPortalCron() {
  if (env.PORTAL_SYNC_ENABLED !== "true") {
    return null;
  }
  const expression = env.PORTAL_SYNC_CRON || "0 7 * * *";
  if (!cron.validate(expression)) {
    console.error(`portal-sync: invalid PORTAL_SYNC_CRON "${expression}"; cron not started.`);
    return null;
  }
  const task = cron.schedule(expression, async () => {
    try {
      const results = await runPortalSync("cron");
      const summary = results.map((r) => `${r.portal}:${r.status}`).join(" ");
      console.log(`portal-sync cron ran: ${summary}`);
    } catch (err) {
      // Best-effort: a cron failure (e.g. tables not yet migrated) must not
      // crash the server. It is logged and the next tick tries again.
      console.error("portal-sync cron failed:", err.message);
    }
  });
  console.log(`portal-sync cron armed: "${expression}"`);
  return task;
}
