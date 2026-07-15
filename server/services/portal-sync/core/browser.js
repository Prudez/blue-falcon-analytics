// server/services/portal-sync/core/browser.js
//
// Playwright bootstrap. One persistent context per portal so cookies
// survive between runs and most syncs skip the login form entirely, which
// is both faster and keeps the password off the wire.
//
// Playwright is imported LAZILY inside openPortalContext, so Phase A — and
// any run where every portal is unconfigured (skipped) — works without
// Playwright installed. The dependency only matters once a real fetcher
// runs (Phase B/C).

import fs from "node:fs";
import path from "node:path";

export async function openPortalContext(portalCode, env) {
  const { chromium } = await import("playwright");

  const storageDir = env.PORTAL_SYNC_STORAGE_DIR || "./.storage/portal-sync";
  const portalStorage = path.join(storageDir, portalCode);
  fs.mkdirSync(portalStorage, { recursive: true });
  const statePath = path.join(portalStorage, "state.json");

  // Default true; only PORTAL_SYNC_HEADLESS=false opens a visible browser,
  // which the skill recommends while shaping selectors against a live CRM.
  const headless = env.PORTAL_SYNC_HEADLESS !== "false";
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    storageState: fs.existsSync(statePath) ? statePath : undefined,
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Blue Falcon portal-sync; internal analytics; contact: info@bluefalconreal.com)",
  });

  // Fast-fail: portals should answer in seconds. A hung selector must not
  // hold the whole nightly sync open.
  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(30_000);

  const page = await context.newPage();

  const close = async () => {
    try {
      // Persist cookies so the next run skips the login form.
      await context.storageState({ path: statePath });
    } catch {
      /* not fatal — a failed save just means the next run logs in again */
    }
    await context.close();
    await browser.close();
  };

  return { browser, context, page, close };
}

// Typed failures a fetcher can throw so the audit trail distinguishes a
// dead session from a broken selector from a rate-limit — the three reasons
// portal numbers go stale.
export class LoginRequiredError extends Error {}
export class RateLimitError extends Error {}
export class SelectorBrokenError extends Error {}
