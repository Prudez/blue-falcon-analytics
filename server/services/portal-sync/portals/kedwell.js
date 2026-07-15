// server/services/portal-sync/portals/kedwell.js
//
// Kedwell fetcher. Stays unconfigured until the trial-subscription
// decision and Kedwell's API answer (see the portal-sync skill's
// references/kedwell.md and the workstream brief). Interface only for now;
// no creds -> the sync loop records it as skipped.

export const code = "kedwell";
export const displayName = "Kedwell";
export const baseUrl = "https://kedwell.co.ke";

export function isConfigured(env) {
  return Boolean(env.KEDWELL_EMAIL && env.KEDWELL_PASSWORD);
}

export async function login() {
  throw new Error(
    "kedwell fetcher is not implemented yet (pending subscription + API decision)."
  );
}

export async function fetchListings() {
  throw new Error("kedwell fetcher is not implemented yet (pending subscription + API decision).");
}

export default { code, displayName, baseUrl, isConfigured, login, fetchListings };
