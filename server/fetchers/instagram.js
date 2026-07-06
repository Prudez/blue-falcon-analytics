// server/fetchers/instagram.js
//
// Instagram Graph API client (Business/Creator accounts via the Meta
// "PropIQ Sync" app). Written fresh for Phase 3 — PropIQ's original
// instagram.js was not available to port, and had known bugs anyway.
// The fixes it needed are built in here:
//   - `views` is the insights metric; `impressions` is deprecated for media.
//   - Post ids are NEVER derived from URL shortcodes. We list the account's
//     own media and match permalinks against stored post URLs; the media id
//     the API returns is the only id we trust.
//
// Pure fetch, no DB coupling: callers pass credentials in, data comes out.
//
// Two token flavors are supported, auto-detected by prefix:
//   - "EAA..." — Meta/Facebook-login tokens → graph.facebook.com, and the
//     numeric IG_USER_ID must be supplied.
//   - "IG..."  — Instagram-business-login tokens (generated in the app
//     dashboard under Instagram → API setup) → graph.instagram.com, where
//     /me IS the Instagram account, so no separate id is needed.

const VERSION = "v23.0";

export function isInstagramLoginToken(token) {
  return typeof token === "string" && token.startsWith("IG");
}

function graphBase(token) {
  return isInstagramLoginToken(token)
    ? `https://graph.instagram.com/${VERSION}`
    : `https://graph.facebook.com/${VERSION}`;
}

async function graphGet(token, path, params) {
  const url = new URL(`${graphBase(token)}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message ?? `Graph API ${res.status}`;
    const err = new Error(`Instagram Graph API: ${msg}`);
    err.graphCode = body?.error?.code;
    throw err;
  }
  return body;
}

// Account header: who we are and how many follow us. With an Instagram-
// login token the account is always /me and user_id carries the real id;
// with a Facebook-login token the caller supplies the numeric id.
export async function fetchAccount({ igUserId, accessToken }) {
  const ig = isInstagramLoginToken(accessToken);
  const data = await graphGet(accessToken, ig ? "me" : igUserId, {
    fields: ig
      ? "user_id,username,followers_count,media_count"
      : "username,followers_count,media_count",
    access_token: accessToken,
  });
  return {
    id: ig ? String(data.user_id ?? data.id ?? "") : String(igUserId),
    username: data.username,
    followers: data.followers_count ?? null,
    mediaCount: data.media_count ?? null,
  };
}

// The account's own media, newest first, paged. like_count/comments_count
// ride along on the media object itself — no insights call needed for them.
export async function fetchMedia({ igUserId, accessToken, maxPages = 4 }) {
  const media = [];
  let path = `${isInstagramLoginToken(accessToken) ? "me" : igUserId}/media`;
  let params = {
    fields: "id,caption,permalink,timestamp,media_type,like_count,comments_count",
    limit: "50",
    access_token: accessToken,
  };
  for (let page = 0; page < maxPages; page++) {
    const body = await graphGet(accessToken, path, params);
    media.push(...(body.data ?? []));
    const next = body.paging?.next;
    if (!next) break;
    // paging.next is a fully-formed URL; strip it back to path + params.
    const u = new URL(next);
    path = u.pathname.replace(/^\/v[\d.]+\//, "");
    params = Object.fromEntries(u.searchParams);
  }
  return media;
}

// Per-post insights. Metric availability varies by media type and account,
// so unsupported metrics degrade to null instead of failing the sync.
export async function fetchInsights({ mediaId, accessToken }) {
  const wanted = ["reach", "views", "saved", "shares", "total_interactions"];
  try {
    const body = await graphGet(accessToken, `${mediaId}/insights`, {
      metric: wanted.join(","),
      access_token: accessToken,
    });
    const byName = {};
    for (const m of body.data ?? []) {
      byName[m.name] = m.values?.[0]?.value ?? null;
    }
    return {
      reach: byName.reach ?? null,
      views: byName.views ?? null,
      saves: byName.saved ?? null,
      shares: byName.shares ?? null,
      totalInteractions: byName.total_interactions ?? null,
    };
  } catch (err) {
    // Insights can be unavailable (old posts, unsupported types). The post
    // still counts; it just carries only likes/comments from the media list.
    console.error(`Insights unavailable for media ${mediaId}:`, err.message);
    return { reach: null, views: null, saves: null, shares: null, totalInteractions: null };
  }
}

// Instagram permalinks identify a post by its /p/<code>/ or /reel/<code>/
// segment. Users paste URLs with query strings, share suffixes, or a
// different host form, so match on the code, not the full string.
export function permalinkCode(url) {
  const m = String(url).match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
