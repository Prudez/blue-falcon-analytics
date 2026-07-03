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
  // The pooler terminates connections it considers idle. Keep sockets
  // alive, and release our own idle clients quickly so we rarely hold one
  // long enough for the pooler to kill it under us.
  keepAlive: true,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

// When an idle client's connection dies, the pool emits 'error'. Without a
// listener that event CRASHES the entire process (observed live: FATAL
// 57P01 from the pooler took the server down). The pool discards the dead
// client on its own; logging is all that is left to do.
pool.on("error", (err) => {
  console.error("Idle database connection dropped (pool recovers):", err.message);
});

// Errors that mean "the connection died", not "the query is wrong".
// 57P01 = admin_shutdown, what Supabase's pooler sends when it reaps a
// connection. The socket-level codes cover network drops.
function isConnectionError(err) {
  return (
    err.code === "57P01" ||
    err.code === "ECONNRESET" ||
    err.code === "EPIPE" ||
    err.code === "ETIMEDOUT" ||
    /connection terminated/i.test(err.message ?? "")
  );
}

export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    // The pool handed us a connection the pooler had already killed. One
    // retry gets a fresh connection; a second failure is a real outage and
    // propagates.
    console.error("Query hit a dead connection, retrying once:", err.message);
    return pool.query(text, params);
  }
}
