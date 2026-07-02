// shared/contract.js
//
// Single source of truth for the API surface. Both the backend and the
// frontend import from this file. The backend validates its responses
// against these schemas at the boundary; the frontend derives its checks
// from the same schemas. Neither side defines a shape independently.
//
// Add a new endpoint by adding an entry here first, then wiring the route
// and the fetch call to it.

import { z } from "zod";

// ---- Shared shapes ---------------------------------------------------

// Reused across every failing route, so the frontend can handle errors
// generically instead of per-endpoint.
export const ErrorResponse = z.object({
  error: z.string(),
  message: z.string(),
});

// ---- Endpoints ---------------------------------------------------------

export const contract = {
  health: {
    method: "GET",
    path: "/api/health",
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      timestamp: z.string().datetime(),
    }),
  },
};
