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
