import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getInstagramOverview, syncInstagram } from "../api.js";

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

function FollowerTrendCard({ trend }) {
  const data = trend
    .filter((p) => p.followers !== null)
    .map((p) => ({ label: dateLabel(p.capturedAt), followers: p.followers }));
  return (
    <div className="card chart-card">
      <h2>Follower Trend</h2>
      {data.length === 0 ? (
        <p className="loading">No follower data yet. It records on every sync.</p>
      ) : data.length === 1 ? (
        <p className="loading">
          {data[0].followers.toLocaleString()} followers as of {data[0].label}. The trend line
          draws once a second sync lands.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data}>
            <XAxis dataKey="label" />
            <YAxis domain={["auto", "auto"]} allowDecimals={false} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="followers"
              name="Followers"
              stroke="var(--chart-purple)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
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
          No tracked posts yet. Link Instagram posts to listings on the Listings page, then sync.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Post</th>
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
  const [syncState, setSyncState] = useState({ busy: false, message: null, error: null });

  function load() {
    return getInstagramOverview()
      .then(setOverview)
      .catch((err) => setLoadError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function runSync() {
    setSyncState({ busy: true, message: null, error: null });
    try {
      const result = await syncInstagram();
      setSyncState({
        busy: false,
        error: null,
        message:
          `Synced @${result.account.handle}: ${result.postsMatched} post` +
          `${result.postsMatched === 1 ? "" : "s"} matched, ` +
          `${result.metricsCaptured} metrics captured` +
          (result.linksUnmatched > 0
            ? `, ${result.linksUnmatched} link${result.linksUnmatched === 1 ? "" : "s"} did not match any post on the account`
            : ""),
      });
      await load();
    } catch (err) {
      setSyncState({ busy: false, message: null, error: err.message });
    }
  }

  if (loadError) {
    return <div className="error-banner">Could not load marketing data: {loadError}</div>;
  }
  if (!overview) {
    return <p className="loading">Loading marketing data…</p>;
  }

  const { account, kpis, followerTrend, topPosts } = overview;

  return (
    <>
      <div className="card sync-bar">
        <div>
          {account ? (
            <>
              <strong>Instagram · @{account.handle}</strong>
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
            <>
              <strong>Instagram</strong>
              <span className="card-note">
                not synced yet — link posts to listings, then sync
              </span>
            </>
          )}
        </div>
        <button className="button-primary" onClick={runSync} disabled={syncState.busy}>
          {syncState.busy ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {syncState.error && <div className="error-banner">Sync failed: {syncState.error}</div>}
      {syncState.message && <div className="success-banner">{syncState.message}</div>}

      <div className="kpi-row">
        <KpiCard label="Followers" value={account?.followers?.toLocaleString() ?? "—"} />
        <KpiCard label="Total Reach" value={kpis.reach.toLocaleString()} />
        <KpiCard
          label="Engagement Rate"
          value={kpis.engagementRate === null ? "—" : `${(kpis.engagementRate * 100).toFixed(1)}%`}
        />
        <KpiCard label="Posts Tracked" value={kpis.postsTracked} />
      </div>

      <div className="chart-row">
        <FollowerTrendCard trend={followerTrend} />
        <TopPostsCard posts={topPosts} />
      </div>
    </>
  );
}
