// client/src/api.js
//
// Fetch calls import their shapes from shared/contract.js rather than
// redefining them. The response is parsed through the contract's schema on
// arrival, so a drift between backend and frontend surfaces immediately in
// development instead of showing up as a silent undefined field.

import { contract } from "../../shared/contract.js";

const API_URL = import.meta.env.VITE_API_URL;

async function getJson(endpoint) {
  const res = await fetch(`${API_URL}${endpoint.path}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.message ?? `GET ${endpoint.path} failed`);
  }
  return endpoint.response.parse(body);
}

// Endpoints with a body (PATCH/POST). `params` fills :placeholders in the
// path; the body is validated against the contract before it is sent, so a
// malformed call fails here in development, not as a server 400.
async function sendJson(endpoint, params, body) {
  const path = endpoint.path.replace(/:(\w+)/g, (_, key) => encodeURIComponent(params[key]));
  const res = await fetch(`${API_URL}${path}`, {
    method: endpoint.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(endpoint.request.parse(body)),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message ?? `${endpoint.method} ${path} failed`);
  }
  return endpoint.response.parse(data);
}

export const getHealth = () => getJson(contract.health);
export const getKpiSummary = () => getJson(contract.kpiSummary);
export const getListingsByStatus = () => getJson(contract.listingsByStatus);
export const getListingsByLocation = () => getJson(contract.listingsByLocation);
export const getPlatformPerformance = () => getJson(contract.platformPerformance);
export const getSalesOverTime = () => getJson(contract.salesOverTime);
export const getLeadFunnel = () => getJson(contract.leadFunnel);
export const getRevenueTrend = () => getJson(contract.revenueTrend);
export const getPriceBands = () => getJson(contract.priceBands);
export const getRecentLeads = () => getJson(contract.recentLeads);
export const listProperties = () => getJson(contract.listProperties);
export const createProperty = (body) => sendJson(contract.createProperty, {}, body);
export const updateProperty = (id, patch) => sendJson(contract.updateProperty, { id }, patch);
export const listPlatformLinks = () => getJson(contract.listPlatformLinks);
export const addPlatformLink = (body) => sendJson(contract.addPlatformLink, {}, body);
export const deletePlatformLink = (id) => sendJson(contract.deletePlatformLink, { id }, {});
export const createLead = (body) => sendJson(contract.createLead, {}, body);
export const getMarketingOverview = () => getJson(contract.marketingOverview);
export const syncInstagram = () => sendJson(contract.syncInstagram, {}, {});
export const syncFacebook = () => sendJson(contract.syncFacebook, {}, {});
