// server/services/portal-sync/portals/buyrentkenya.js
//
// BuyRentKenya agent-CRM fetcher. Phase A ships the interface only: the
// real login flow and listing selectors are Phase B, shaped against the
// live CRM per the portal-sync skill's references/buyrentkenya.md, and only
// if BuyRentKenya has no API/export we can use instead.
//
// isConfigured is honest today: with no BUYRENTKENYA_* creds set, the sync
// loop records this portal as "skipped". If creds are added before Phase B,
// login throws a clear message rather than pretending to have data.

export const code = "buyrentkenya";
export const displayName = "BuyRentKenya";
export const baseUrl = "https://www.buyrentkenya.com";

export function isConfigured(env) {
  return Boolean(env.BUYRENTKENYA_EMAIL && env.BUYRENTKENYA_PASSWORD);
}

export async function login() {
  throw new Error(
    "buyrentkenya fetcher is not implemented yet (Phase B). Remove BUYRENTKENYA_* creds to keep it disabled until then."
  );
}

export async function fetchListings() {
  throw new Error("buyrentkenya fetcher is not implemented yet (Phase B).");
}

export default { code, displayName, baseUrl, isConfigured, login, fetchListings };
