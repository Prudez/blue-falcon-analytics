// server/env.js
//
// Validates the environment once, at startup, before the server accepts
// traffic. A missing or empty required key crashes here with a clear
// message naming the key, instead of failing deep inside a request later.
//
// Import `env` from this file everywhere instead of reading process.env
// directly, so a mistyped key name is caught in one place.
//
// Server-side only. Nothing here is VITE_ prefixed; none of it should ever
// reach the browser.

import { z } from "zod";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// npm workspaces run this with cwd = server/, but .env lives at the repo
// root, so point dotenv at it explicitly rather than relying on cwd.
// override: true because dev tooling sometimes injects its own PORT for the
// frontend into the whole process tree (concurrently spawns both servers
// under one parent); .env is this app's explicit config and should win.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(rootDir, ".env"), override: true });

// .env leaves unset optional keys as "" rather than absent; treat empty
// strings as undefined so .optional() actually skips them.
const optional = (validator) =>
  z.preprocess((val) => (val === "" ? undefined : val), validator.optional());

const schema = z.object({
  PORT: z.coerce.number().default(3001),

  // Postgres connection string for the PropIQ Supabase project, via the
  // Transaction pooler on port 6543. Required: this is what /api/health
  // queries against.
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Supabase project keys. Not consumed by Phase 0 (the backend talks to
  // Postgres directly via DATABASE_URL), but declared here so later phases
  // that add supabase-js or storage access fail fast if unset.
  SUPABASE_URL: optional(z.string().url()),
  SUPABASE_ANON_KEY: optional(z.string()),
  SUPABASE_SERVICE_ROLE_KEY: optional(z.string()),

  // Meta / Instagram Graph API (the "Blue Falcon Analytics" Meta app).
  // Optional so the app runs without marketing sync; the sync endpoint
  // refuses with a clear message when these are unset.
  META_ACCESS_TOKEN: optional(z.string()),
  IG_USER_ID: optional(z.string().regex(/^\d+$/, "IG_USER_ID is the numeric Instagram Business account id")),

  // Single-user login. Unset = auth off (local development). A public
  // deployment must set this; 12+ characters keeps brute force boring.
  APP_PASSWORD: optional(z.string().min(12, "APP_PASSWORD must be at least 12 characters")),

  // Facebook Page sync, same Meta app. FB_ACCESS_TOKEN is a Facebook-login
  // user token; with META_APP_ID + META_APP_SECRET set, the server
  // exchanges it for a long-lived one on first sync and persists that back
  // to .env, so the Explorer's 1-2 hour token only has to survive one sync.
  // FB_PAGE_ID picks the Page when the account manages more than one.
  FB_ACCESS_TOKEN: optional(z.string()),
  META_APP_ID: optional(z.string().regex(/^\d+$/, "META_APP_ID is the numeric app id")),
  META_APP_SECRET: optional(z.string()),
  FB_PAGE_ID: optional(z.string().regex(/^\d+$/, "FB_PAGE_ID is the numeric Page id")),

  // Portal-sync (sync-integration workstream). Portal LOGIN credentials are
  // the highest-sensitivity secrets in .env — a leaked portal password
  // grants full account access, not just read. Server-side only, never
  // VITE_-prefixed. A portal whose creds are absent is treated as disabled
  // (reported "skipped"), so all of these are optional.
  BUYRENTKENYA_EMAIL: optional(z.string()),
  BUYRENTKENYA_PASSWORD: optional(z.string()),
  BUYRENTKENYA_AGENCY_ID: optional(z.string()),
  PROPERTY24_EMAIL: optional(z.string()),
  PROPERTY24_PASSWORD: optional(z.string()),
  KEDWELL_EMAIL: optional(z.string()),
  KEDWELL_PASSWORD: optional(z.string()),

  // Portal-sync scheduling and browser behavior. The cron is OFF unless
  // PORTAL_SYNC_ENABLED is exactly "true" — keep it off until migration 005
  // is applied live. Kept as strings; the service reads/validates them.
  PORTAL_SYNC_ENABLED: optional(z.string()),
  PORTAL_SYNC_CRON: optional(z.string()),
  PORTAL_SYNC_REFRESH_DAYS: optional(z.string()),
  PORTAL_SYNC_HEADLESS: optional(z.string()),
  PORTAL_SYNC_STORAGE_DIR: optional(z.string()),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n  ");
  // Crash loudly. Names and reasons only, never values.
  console.error(`Invalid or missing environment variables:\n  ${missing}`);
  process.exit(1);
}

// Never log this object; DATABASE_URL carries a password.
export const env = parsed.data;
