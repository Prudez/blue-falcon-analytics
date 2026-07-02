// client/src/api.js
//
// Fetch calls import their shapes from shared/contract.js rather than
// redefining them. The response is parsed through the contract's schema on
// arrival, so a drift between backend and frontend surfaces immediately in
// development instead of showing up as a silent undefined field.

import { contract } from "../../shared/contract.js";

const API_URL = import.meta.env.VITE_API_URL;

export async function getHealth() {
  const res = await fetch(`${API_URL}${contract.health.path}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.message ?? "Health check failed");
  }
  return contract.health.response.parse(body);
}
