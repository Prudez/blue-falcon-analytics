// core/config.js
// Fail-fast environment validation. Import `config` from here everywhere;
// never read process.env directly in connector code.
// Secrets are server-side only. Never VITE_-prefix anything in this file.

const { z } = require('zod');

const envSchema = z.object({
  // --- Database (required) ---
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Supabase Transaction pooler, port 6543)'),
  DB_SCHEMA: z.string().default('propiq'),

  // --- Framework ---
  CONNECTOR_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CONNECTOR_HEADLESS: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  CONNECTOR_STORAGE_DIR: z.string().default('./.storage/connectors'),
  CONNECTOR_REFRESH_DAYS: z.coerce.number().int().positive().default(30),

  // --- Meta (Facebook + Instagram) — filled in M2, optional in M1 ---
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_PAGE_ID: z.string().optional(),
  META_IG_BUSINESS_ID: z.string().optional(),
  META_LONG_LIVED_TOKEN: z.string().optional(),

  // --- TikTok Studio (Playwright) — M3 ---
  TIKTOK_EMAIL: z.string().optional(),
  TIKTOK_PASSWORD: z.string().optional(),

  // --- Portals — M3 ---
  BUYRENTKENYA_EMAIL: z.string().optional(),
  BUYRENTKENYA_PASSWORD: z.string().optional(),
  PROPERTY24_EMAIL: z.string().optional(),
  PROPERTY24_PASSWORD: z.string().optional(),
  // Kedwell: stub until the trial account is configured
  KEDWELL_EMAIL: z.string().optional(),
  KEDWELL_PASSWORD: z.string().optional(),
});

let config;
try {
  config = envSchema.parse(process.env);
} catch (err) {
  if (err instanceof z.ZodError) {
    const missing = err.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // eslint-disable-next-line no-console
    console.error(`[connectors] Environment validation failed:\n${missing}`);
    process.exit(1);
  }
  throw err;
}

module.exports = { config };
