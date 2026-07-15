// server/services/portal-sync/portals/property24.js
//
// Property24 agent-portal fetcher. Phase A ships the interface only; the
// real flow and selectors are Phase C, per the portal-sync skill's
// references/property24.md. isConfigured is honest: no creds -> skipped.

export const code = "property24";
export const displayName = "Property24";
export const baseUrl = "https://www.property24.co.ke";

export function isConfigured(env) {
  return Boolean(env.PROPERTY24_EMAIL && env.PROPERTY24_PASSWORD);
}

export async function login() {
  throw new Error(
    "property24 fetcher is not implemented yet (Phase C). Remove PROPERTY24_* creds to keep it disabled until then."
  );
}

export async function fetchListings() {
  throw new Error("property24 fetcher is not implemented yet (Phase C).");
}

export default { code, displayName, baseUrl, isConfigured, login, fetchListings };
