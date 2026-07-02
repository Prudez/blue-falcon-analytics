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

// Listing lifecycle. Matches the CHECK constraint on propiq.properties.status
// (migration 001); change both together or neither.
export const ListingStatus = z.enum(["available", "under_offer", "sold"]);

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

  // Overview top row: one call, all four numbers.
  kpiSummary: {
    method: "GET",
    path: "/api/kpis/summary",
    request: z.object({}),
    response: z.object({
      activeListings: z.number().int().nonnegative(),
      underOffer: z.number().int().nonnegative(),
      sold: z.number().int().nonnegative(),
      leadsCaptured: z.number().int().nonnegative(),
    }),
  },

  // Donut widget. Every status appears exactly once, zero-count included,
  // so the chart legend is stable regardless of the data.
  listingsByStatus: {
    method: "GET",
    path: "/api/listings/by-status",
    request: z.object({}),
    response: z.object({
      breakdown: z.array(
        z.object({
          status: ListingStatus,
          count: z.number().int().nonnegative(),
        })
      ),
    }),
  },

  // Location breakdown widget. Properties with no location yet are grouped
  // under the literal label "Unspecified" by the backend.
  listingsByLocation: {
    method: "GET",
    path: "/api/listings/by-location",
    request: z.object({}),
    response: z.object({
      breakdown: z.array(
        z.object({
          location: z.string(),
          count: z.number().int().nonnegative(),
        })
      ),
    }),
  },
};
