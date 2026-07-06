// server/fetchers/facebook.js
//
// Facebook Pages Graph API client, mirroring fetchers/instagram.js: pure
// fetch, no DB coupling. The caller supplies a Facebook-login user token
// (EAA...); resolvePage turns it into the Page and the Page's own token,
// which is what post and insights reads require.
//
// Page post insights have been heavily pruned by Meta over the years; only
// the post_impressions family is relied on here, and it degrades to nulls
// when unavailable. Likes/comments/shares come from the post object itself.

const GRAPH = "https://graph.facebook.com/v23.0";

async function graphGet(path, params) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(`Facebook Graph API: ${body?.error?.message ?? `HTTP ${res.status}`}`);
    err.graphCode = body?.error?.code;
    throw err;
  }
  return body;
}

// Exchange a short-lived user token for a long-lived (~60 day) one.
// Returns null when app credentials are missing or the exchange fails —
// the caller then proceeds with the original token.
export async function exchangeForLongLivedToken({ token, appId, appSecret }) {
  if (!appId || !appSecret) return null;
  try {
    const body = await graphGet("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: token,
    });
    return body.access_token ?? null;
  } catch (err) {
    console.error("Token exchange failed (continuing with the stored token):", err.message);
    return null;
  }
}

// The Pages this user manages, with each Page's own access token.
// Picks pageId when given, otherwise the only/first Page.
export async function resolvePage({ userToken, pageId }) {
  const body = await graphGet("me/accounts", {
    fields: "id,name,access_token,followers_count,fan_count",
    access_token: userToken,
  });
  const pages = body.data ?? [];
  if (pages.length === 0) {
    throw new Error(
      "No Facebook Pages found for this token. It needs the pages_show_list permission, granted for the Page, when generated."
    );
  }
  const page = pageId ? pages.find((p) => p.id === pageId) : pages[0];
  if (!page) {
    throw new Error(`FB_PAGE_ID ${pageId} is not among this token's Pages.`);
  }
  return {
    id: page.id,
    name: page.name,
    pageToken: page.access_token,
    followers: page.followers_count ?? page.fan_count ?? null,
  };
}

// The Page's own posts, newest first, paged. Engagement counts ride along;
// only impressions need the insights endpoint.
export async function fetchPagePosts({ pageId, pageToken, maxPages = 4 }) {
  const posts = [];
  let path = `${pageId}/posts`;
  let params = {
    fields:
      "id,message,permalink_url,created_time,shares,likes.summary(true).limit(0),comments.summary(true).limit(0)",
    limit: "50",
    access_token: pageToken,
  };
  for (let page = 0; page < maxPages; page++) {
    const body = await graphGet(path, params);
    posts.push(...(body.data ?? []));
    const next = body.paging?.next;
    if (!next) break;
    const u = new URL(next);
    path = u.pathname.replace(/^\/v[\d.]+\//, "");
    params = Object.fromEntries(u.searchParams);
  }
  return posts;
}

// Impressions and reach for one post; nulls when Meta withholds them.
export async function fetchPostInsights({ postId, pageToken }) {
  try {
    const body = await graphGet(`${postId}/insights`, {
      metric: "post_impressions,post_impressions_unique",
      access_token: pageToken,
    });
    const byName = {};
    for (const m of body.data ?? []) {
      byName[m.name] = m.values?.[0]?.value ?? null;
    }
    return {
      views: byName.post_impressions ?? null,
      reach: byName.post_impressions_unique ?? null,
    };
  } catch (err) {
    console.error(`Insights unavailable for post ${postId}:`, err.message);
    return { views: null, reach: null };
  }
}

// Matching key for a Facebook post URL. Facebook URLs come in many shapes
// (/posts/pfbid..., /posts/123..., permalink.php?story_fbid=...), so match
// on the post identifier, not the whole string. Opaque /share/p/ links
// carry no post id and cannot be matched; those stay unmatched and the UI
// hint tells users to paste the post's full URL instead.
export function facebookPostKey(url) {
  const s = String(url);
  const pfbid = s.match(/pfbid[0-9A-Za-z]+/);
  if (pfbid) return pfbid[0];
  const story = s.match(/story_fbid=(\d+)/);
  if (story) return story[1];
  const posts = s.match(/\/posts\/(\d+)/);
  if (posts) return posts[1];
  return null;
}

// The same key for a post object returned by the API. The API id form is
// "{pageid}_{postid}"; the permalink usually carries the pfbid form.
export function facebookApiPostKeys(post) {
  const keys = [];
  const fromPermalink = post.permalink_url ? facebookPostKey(post.permalink_url) : null;
  if (fromPermalink) keys.push(fromPermalink);
  const idPart = String(post.id ?? "").split("_")[1];
  if (idPart) keys.push(idPart);
  return keys;
}
