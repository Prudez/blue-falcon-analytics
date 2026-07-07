import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getMarketingOverview, syncInstagram, syncFacebook } from "../api.js";
import { platformLabel, platformColor } from "../platforms.js";

// The platforms that have a working API sync today. TikTok and X arrive
// later (manual entry or API); their links can already be stored.
const SYNCABLE = [
  { platform: "instagram", run: syncInstagram },
  { platform: "facebook", run: syncFacebook },
];

function KpiCard({ label, value }) {
  return (
    <div className="card kpi-card">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function dateLabel(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function SyncBar({ account, platform, busy, onSync }) {
  return (
    <div className="card sync-bar">
      <div>
        <strong>{platformLabel(platform)}</strong>
        {account ? (
          <>
            <span className="card-note">
              {account.handle}
              {account.followers !== null && ` · ${account.followers.toLocaleString()} followers`}
            </span>
            <span className="card-note">
              last synced{" "}
              {account.lastSyncedAt
                ? new Date(account.lastSyncedAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "never"}
            </span>
          </>
        ) : (
          <span className="card-note">not connected yet</span>
        )}
      </div>
      <button className="button-primary" onClick={onSync} disabled={busy}>
        {busy ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}

// One line per platform. Recharts wants a unified x-axis, so points merge
// by calendar day; a platform without a value that day just has a gap.
function FollowerTrendCard({ trends }) {
  const withData = trends
    .map((t) => ({ ...t, points: t.points.filter((p) => p.followers !== null) }))
    .filter((t) => t.points.length > 0);

  const totalPoints = withData.reduce((s, t) => s + t.points.length, 0);
  // Flatten, sort chronologically across platforms, then merge by day —
  // otherwise the axis follows insertion order, not time.
  const flat = withData
    .flatMap((t) => t.points.map((p) => ({ ...p, platform: t.platform })))
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
  const byDay = new Map();
  for (const p of flat) {
    const label = dateLabel(p.capturedAt);
    if (!byDay.has(label)) byDay.set(label, { label });
    byDay.get(label)[p.platform] = p.followers;
  }
  const data = [...byDay.values()];

  return (
    <div className="card chart-card">
      <h2>Follower Trend</h2>
      {withData.length === 0 ? (
        <p className="loading">No follower data yet. It records on every sync.</p>
      ) : totalPoints === withData.length ? (
        <p className="loading">
          {withData
            .map((t) => `${platformLabel(t.platform)}: ${t.points[0].followers.toLocaleString()}`)
            .join(" · ")}{" "}
          — the trend lines draw once a second sync lands.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data}>
            <XAxis dataKey="label" />
            <YAxis domain={["auto", "auto"]} allowDecimals={false} />
            <Tooltip />
            <Legend formatter={(value) => platformLabel(value)} />
            {withData.map((t) => (
              <Line
                key={t.platform}
                type="monotone"
                dataKey={t.platform}
                name={platformLabel(t.platform)}
                stroke={platformColor(t.platform)}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function TopPostsCard({ posts }) {
  return (
    <div className="card chart-card">
      <h2>Top Posts by Engagement</h2>
      {posts.length === 0 ? (
        <p className="loading">
          No tracked posts yet. Link posts to listings on the Listings page, then sync.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Post</th>
              <th>Platform</th>
              <th>Property</th>
              <th>Reach</th>
              <th>Likes</th>
              <th>Comments</th>
              <th>Engagement</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.postId}>
                <td className="caption-cell">
                  {post.permalink ? (
                    <a href={post.permalink} target="_blank" rel="noreferrer">
                      {post.caption ? post.caption.slice(0, 60) : "View post"}
                      {post.caption && post.caption.length > 60 ? "…" : ""}
                    </a>
                  ) : (
                    post.caption ?? "—"
                  )}
                </td>
                <td>{platformLabel(post.platform)}</td>
                <td>{post.propertyName}</td>
                <td>{post.reach ?? "—"}</td>
                <td>{post.likes ?? "—"}</td>
                <td>{post.comments ?? "—"}</td>
                <td>
                  <strong>{post.engagement}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Marketing() {
  const [overview, setOverview] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [syncState, setSyncState] = useState({ platform: null, message: null, error: null });

  function load() {
    return getMarketingOverview()
      .then(setOverview)
      .catch((err) => setLoadError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function runSync(platform, run) {
    setSyncState({ platform, message: null, error: null });
    try {
      const result = await run();
      setSyncState({
        platform: null,
        error: null,
        message:
          `Synced ${result.account.handle}: ${result.postsMatched} post` +
          `${result.postsMatched === 1 ? "" : "s"} matched, ` +
          `${result.metricsCaptured} metrics captured` +
          (result.linksUnmatched > 0
            ? `, ${result.linksUnmatched} link${result.linksUnmatched === 1 ? "" : "s"} did not match any post on the account`
            : ""),
      });
      await load();
    } catch (err) {
      setSyncState({ platform: null, message: null, error: err.message });
    }
  }

  if (loadError) {
    return <div className="error-banner">Could not load marketing data: {loadError}</div>;
  }
  if (!overview) {
    return <p className="loading">Loading marketing data…</p>;
  }

  const { accounts, kpis, followerTrends, topPosts } = overview;
  const totalFollowers = accounts.reduce((s, a) => s + (a.followers ?? 0), 0);

  return (
    <>
      <div className="sync-row">
        {SYNCABLE.map(({ platform, run }) => (
          <SyncBar
            key={platform}
            platform={platform}
            account={accounts.find((a) => a.platform === platform) ?? null}
            busy={syncState.platform === platform}
            onSync={() => runSync(platform, run)}
          />
        ))}
      </div>
      {syncState.error && <div className="error-banner">Sync failed: {syncState.error}</div>}
      {syncState.message && <div className="success-banner">{syncState.message}</div>}

      <div className="kpi-row">
        <KpiCard label="Followers (all platforms)" value={totalFollowers.toLocaleString()} />
        <KpiCard label="Total Reach" value={kpis.reach.toLocaleString()} />
        <KpiCard
          label="Engagement Rate"
          value={kpis.engagementRate === null ? "—" : `${(kpis.engagementRate * 100).toFixed(1)}%`}
        />
        <KpiCard label="Posts Tracked" value={kpis.postsTracked} />
      </div>

      <div className="chart-row">
        <FollowerTrendCard trends={followerTrends} />
        <TopPostsCard posts={topPosts} />
      </div>
    </>
  );
}
