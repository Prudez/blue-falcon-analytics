// client/src/api.js
//
// Fetch calls import their shapes from shared/contract.js rather than
// redefining them. The response is parsed through the contract's schema on
// arrival, so a drift between backend and frontend surfaces immediately in
// development instead of showing up as a silent undefined field.

import { contract } from "../../shared/contract.js";

const API_URL = import.meta.env.VITE_API_URL;

// All contract endpoints are GETs with no request payload so far; one helper
// covers them. Revisit when the contract grows params or bodies.
async function getJson(endpoint) {
  const res = await fetch(`${API_URL}${endpoint.path}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.message ?? `GET ${endpoint.path} failed`);
  }
  return endpoint.response.parse(body);
}

export const getHealth = () => getJson(contract.health);
export const getKpiSummary = () => getJson(contract.kpiSummary);
export const getListingsByStatus = () => getJson(contract.listingsByStatus);
export const getListingsByLocation = () => getJson(contract.listingsByLocation);
