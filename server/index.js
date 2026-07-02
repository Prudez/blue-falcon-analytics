// server/index.js
//
// Express entry point. Routes validate their responses against
// shared/contract.js before sending, so a shape drift fails loudly here
// instead of silently on the client.

import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { query } from "./db.js";
import { contract, ErrorResponse } from "../shared/contract.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get(contract.health.path, async (req, res) => {
  try {
    const result = await query("SELECT NOW() AS now");
    const body = contract.health.response.parse({
      ok: true,
      timestamp: result.rows[0].now.toISOString(),
    });
    res.json(body);
  } catch (err) {
    console.error("GET /api/health failed:", err.message);
    const body = ErrorResponse.parse({
      error: "health_check_failed",
      message: "Could not reach the database.",
    });
    res.status(503).json(body);
  }
});

app.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
});
