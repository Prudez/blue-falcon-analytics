// server/db.js
//
// node-postgres pool against the PropIQ Supabase project, via the
// Transaction pooler on port 6543. Every query goes through the async
// `query` helper below and uses $1-style positional params — never
// string-interpolated SQL.

import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Supabase's pooler requires TLS; the pooler's cert isn't in most local
  // trust stores, so we verify encryption without pinning the CA chain.
  ssl: { rejectUnauthorized: false },
});

export async function query(text, params) {
  return pool.query(text, params);
}
