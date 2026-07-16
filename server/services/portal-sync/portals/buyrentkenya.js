// server/services/portal-sync/portals/buyrentkenya.js
//
// BuyRentKenya agent-CRM fetcher (Phase B). BuyRentKenya has no public API
// (confirmed), so this automates the agent's OWN CRM login and reads the
// same analytics the agent sees at /crm/account/listings.
//
// CREDENTIALS: BuyRentKenya offers no read-only or sub-user account, so
// BUYRENTKENYA_EMAIL/PASSWORD are the agency's MASTER login. That makes one
// invariant non-negotiable: this fetcher is read-only BY BEHAVIOR. It may
// navigate and read only. Never add a click, form submit, or any action
// that could edit, delete, re-price, or boost a listing — a selector slip
// with the master login is destructive, not just a bad read. Login is the
// only form interaction allowed here.
//
// STATUS: first pass, shaped from the portal-sync skill's
// references/buyrentkenya.md. The login flow, storage-state reuse,
// pagination, lazy-load handling, and the metric->schema mapping are real.
// The exact DOM selectors have NOT been verified against the live CRM —
// the reference is explicit that they must be confirmed in DevTools during
// the first run with PORTAL_SYNC_HEADLESS=false. Every unverified selector
// is in the SELECTORS block below and tagged VERIFY LIVE, so the live
// shaping session edits one place, not the whole file.

import { LoginRequiredError, SelectorBrokenError } from "../core/browser.js";

export const code = "buyrentkenya";
export const displayName = "BuyRentKenya";
export const baseUrl = "https://www.buyrentkenya.com";

const LISTINGS_PATH = "/crm/account/listings";
const MAX_PAGES = 20; // safety cap so a broken "next" never loops forever

// All live-DOM assumptions live here. VERIFY LIVE: open the CRM in DevTools
// and confirm/replace each of these against the real page before trusting a
// run. Prefer role/text/attribute selectors over CSS class chains.
const SELECTORS = {
  // A row is anchored by a listing link; the numeric id in its href is the
  // natural key. Fallback covered in rowAnchors() if no data-* attribute.
  listingLink: 'a[href*="/listings/"], a[href*="/property/"]', // VERIFY LIVE
  // Regex over the listing href to pull the portal's own listing id.
  externalIdFromHref: /\/(?:listings|property)\/(\d+)/, // VERIFY LIVE
  // Label regexes for reading a metric by its text, never by column index.
  metricLabels: {
    views: /views|impressions/i,
    saves: /shortlist|save|favou?rite/i,
    contactClicks: /contact|enquir|inquir/i,
    phoneReveals: /call|phone/i,
    whatsapp: /whats\s?app/i,
    inquiries: /enquir|inquir/i,
  },
  boostedBadge: /boost|promoted|featured/i, // VERIFY LIVE
  loginUrl: /login|signin/i, // URL-based login detection; robust to DOM change
};

export function isConfigured(env) {
  return Boolean(env.BUYRENTKENYA_EMAIL && env.BUYRENTKENYA_PASSWORD);
}

// Idempotent login. With a valid stored session, hitting the listings URL
// stays on the listings page and we skip the form entirely; only a redirect
// to the login page triggers credential entry.
export async function login(page, env) {
  await page.goto(`${baseUrl}${LISTINGS_PATH}`, { waitUntil: "domcontentloaded" });
  if (!SELECTORS.loginUrl.test(page.url())) {
    return; // already authenticated via stored cookies
  }

  // VERIFY LIVE: the reference suggests input[name="email"] / [name="password"];
  // getByLabel is tried first as it survives class refactors.
  const email = page.getByLabel(/email/i).or(page.locator('input[name="email"]')).first();
  const password = page
    .getByLabel(/password/i)
    .or(page.locator('input[name="password"]'))
    .first();
  await email.fill(env.BUYRENTKENYA_EMAIL);
  await password.fill(env.BUYRENTKENYA_PASSWORD);
  await page.getByRole("button", { name: /log ?in|sign ?in/i }).click();

  await page
    .waitForURL((u) => !SELECTORS.loginUrl.test(u.toString()), { timeout: 20_000 })
    .catch(() => {
      // A CAPTCHA or a rejected password both land here. Do NOT retry in a
      // loop (the skill: that gets the account flagged) — fail the run.
      throw new LoginRequiredError(
        "BuyRentKenya login did not leave the login page (wrong credentials or a CAPTCHA)."
      );
    });

  // Login lands on the dashboard, not the CRM listings; go there explicitly.
  await page.goto(`${baseUrl}${LISTINGS_PATH}`, { waitUntil: "domcontentloaded" });
}

// Reads every listing across all pages. `since` is accepted for interface
// parity but ignored: the CRM shows all current listings regardless.
export async function fetchListings(page, env, since) {
  const listings = [];
  const seen = new Set();

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    if (pageNum > 1) {
      // Cleaner than clicking "next": the reference notes a ?page= param.
      await page.goto(`${baseUrl}${LISTINGS_PATH}?page=${pageNum}`, {
        waitUntil: "domcontentloaded",
      });
    }
    await settleRows(page);

    const anchors = await rowAnchors(page);
    if (pageNum === 1 && anchors.length === 0) {
      // Zero rows on page 1 means the row selector is wrong, not an empty
      // account — surface it loudly so the audit trail says "selector", and
      // do not silently record an all-zero sync.
      throw new SelectorBrokenError(
        "No BuyRentKenya listing rows found on page 1 — the row selector needs re-shaping (see SELECTORS.listingLink)."
      );
    }
    if (anchors.length === 0) break; // ran past the last page

    let newOnThisPage = 0;
    for (const anchor of anchors) {
      const href = (await anchor.getAttribute("href")) || "";
      const externalId = (href.match(SELECTORS.externalIdFromHref) || [])[1];
      if (!externalId || seen.has(externalId)) continue;
      seen.add(externalId);
      newOnThisPage++;

      const row = anchor.locator("xpath=ancestor-or-self::tr[1]").or(
        anchor.locator("xpath=ancestor-or-self::*[self::li or self::article][1]")
      );
      const rowEl = (await row.count()) ? row.first() : anchor;

      const title = ((await anchor.textContent()) || "").trim() || null;
      const boosted = await matchInRow(rowEl, SELECTORS.boostedBadge);
      const html = await rowEl.innerHTML().catch(() => null);

      listings.push({
        external_id: externalId,
        title,
        url: href.startsWith("http") ? href : `${baseUrl}${href}`,
        status: null, // VERIFY LIVE: read from a status pill if the CRM shows one
        metrics: {
          views: await readMetric(rowEl, SELECTORS.metricLabels.views),
          saves: await readMetric(rowEl, SELECTORS.metricLabels.saves),
          contact_clicks: await readMetric(rowEl, SELECTORS.metricLabels.contactClicks),
          phone_reveals: await readMetric(rowEl, SELECTORS.metricLabels.phoneReveals),
          whatsapp_clicks: await readMetric(rowEl, SELECTORS.metricLabels.whatsapp),
          inquiries: await readMetric(rowEl, SELECTORS.metricLabels.inquiries),
        },
        raw: { html, boosted },
      });
    }

    // No new ids means pagination looped back to the same page — stop.
    if (newOnThisPage === 0) break;
  }

  return listings;
}

// Locate the per-listing row anchors, preferring a semantic data attribute
// and falling back to the href pattern the reference documents.
async function rowAnchors(page) {
  const byData = page.locator("[data-listing-id] a, [data-id] a");
  if (await byData.count()) return byData.all();
  return page.locator(SELECTORS.listingLink).all();
}

// Wait for lazy-loaded rows to stop arriving before reading, per the
// reference: row count stable for a beat beats a fixed sleep.
async function settleRows(page) {
  const selector = SELECTORS.listingLink;
  await page
    .waitForFunction(
      (sel) => {
        const n = document.querySelectorAll(sel).length;
        const w = window;
        const stable = w.__brkPrev === n;
        w.__brkPrev = n;
        return stable && n > 0;
      },
      selector,
      { timeout: 15_000, polling: 500 }
    )
    .catch(() => {
      /* fall through: fetchListings still validates the row count */
    });
}

// Read a metric by its label text and return the adjacent number, or null
// if the CRM does not show it (a NULL metric column is fine — never guess 0).
async function readMetric(rowEl, labelRegex) {
  const label = rowEl.getByText(labelRegex).first();
  if (!(await label.count())) return null;
  const container = label.locator("xpath=..");
  const text = ((await container.textContent()) || "").replace(/[^0-9]/g, "");
  return text ? Number(text) : null;
}

async function matchInRow(rowEl, regex) {
  return (await rowEl.getByText(regex).count()) > 0;
}

export default { code, displayName, baseUrl, isConfigured, login, fetchListings };
