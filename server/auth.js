// server/auth.js
//
// Single-user auth: one password (APP_PASSWORD in .env), a signed expiring
// token in return. No user table, no third-party service — the right size
// for a one-person dashboard.
//
// When APP_PASSWORD is unset, auth is OFF and every request passes: local
// development needs no login. A public deployment MUST set APP_PASSWORD.
//
// Token format: base64url(expiryMillis) + "." + HMAC(expiry). The HMAC key
// derives from APP_PASSWORD, so changing the password invalidates every
// outstanding token.

import crypto from "node:crypto";
import { env } from "./env.js";

export function authEnabled() {
  return Boolean(env.APP_PASSWORD);
}

function hmacKey() {
  return crypto.createHash("sha256").update(`bfa-auth:${env.APP_PASSWORD}`).digest();
}

function sign(payload) {
  return crypto.createHmac("sha256", hmacKey()).update(payload).digest("base64url");
}

export function checkPassword(candidate) {
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(env.APP_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function issueToken(days = 30) {
  const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
  const payload = String(expiresAt);
  return {
    token: `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function verifyToken(token) {
  if (!token || typeof token !== "string") return false;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return false;
  const payload = Buffer.from(encoded, "base64url").toString();
  const expected = sign(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(payload) > Date.now();
}
