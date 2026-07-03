import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  getKpiSummary,
  getListingsByStatus,
  getListingsByLocation,
  getPlatformPerformance,
} from "../api.js";
import LocationBars from "../components/LocationBars.jsx";

const STATUS_LABELS = {
  available: "Available",
  under_offer: "Under Offer",
  sold: "Sold",
};

const STATUS_COLORS = {
  available: "var(--chart-teal)",
  under_offer: "var(--chart-amber)",
  sold: "var(--chart-navy)",
};

function KpiCard({ label, value }) {
  return (
    <div className="card kpi-card">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function StatusDonut({ breakdown }) {
  const data = breakdown.map((row) => ({
    name: STATUS_LABELS[row.status],
    value: row.count,
    color: STATUS_COLORS[row.status],
  }));
  return (
    <div className="card chart-card">
      <h2>Listings by Status</h2>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

const PLATFORM_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X",
};

const PLATFORM_COLORS = {
  facebook: "var(--chart-navy)",
  instagram: "var(--chart-purple)",
  tiktok: "var(--chart-teal)",
  twitter: "var(--chart-amber)",
};

// Full metric breakdown on hover, not just the bar's engagement number.
function PlatformTooltip({ active, payload, label, metricsByKey }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => {
        const m = metricsByKey[`${label}|${entry.dataKey}`];
        return (
          <div key={entry.dataKey} className="tooltip-platform">
            <span style={{ color: entry.color }}>{PLATFORM_LABELS[entry.dataKey]}</span>
            : {entry.value} engagement
            {m && (
              <div className="tooltip-detail">
                reach {m.reach} · impressions {m.impressions} · likes {m.likes} ·
                comments {m.comments} · shares {m.shares} · clicks {m.clicks}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlatformPerformanceCard({ asOf, rows }) {
  if (!rows.length) {
    return (
      <div className="card chart-card full-width">
        <h2>Platform Performance by Property</h2>
        <p className="loading">No platform data yet.</p>
      </div>
    );
  }

  // Pivot to one entry per property with a key per platform, the shape
  // Recharts wants for grouped bars.
  const platforms = [...new Set(rows.map((r) => r.platform))];
  const metricsByKey = {};
  const byProperty = new Map();
  for (const r of rows) {
    if (!byProperty.has(r.propertyName)) {
      byProperty.set(r.propertyName, { property: r.propertyName });
    }
    byProperty.get(r.propertyName)[r.platform] = r.engagement;
    metricsByKey[`${r.propertyName}|${r.platform}`] = r;
  }
  const data = [...byProperty.values()];
  const asOfLabel = asOf
    ? new Date(asOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="card chart-card full-width">
      <h2>
        Platform Performance by Property
        {asOfLabel && <span className="card-note">data as of {asOfLabel}</span>}
      </h2>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <XAxis dataKey="property" />
          <YAxis allowDecimals={false} />
          <Tooltip content={<PlatformTooltip metricsByKey={metricsByKey} />} />
          <Legend formatter={(value) => PLATFORM_LABELS[value]} />
          {platforms.map((p) => (
            <Bar key={p} dataKey={p} fill={PLATFORM_COLORS[p]} radius={[6, 6, 0, 0]} maxBarSize={48} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Overview() {
  const [kpis, setKpis] = useState(null);
  const [byStatus, setByStatus] = useState(null);
  const [byLocation, setByLocation] = useState(null);
  const [platformPerf, setPlatformPerf] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      getKpiSummary(),
      getListingsByStatus(),
      getListingsByLocation(),
      getPlatformPerformance(),
    ])
      .then(([summary, status, location, perf]) => {
        setKpis(summary);
        setByStatus(status.breakdown);
        setByLocation(location.breakdown);
        setPlatformPerf(perf);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <div className="error-banner">Could not load the dashboard: {error}</div>;
  }
  if (!kpis) {
    return <p className="loading">Loading dashboard…</p>;
  }

  return (
    <>
      <div className="kpi-row">
        <KpiCard label="Active Listings" value={kpis.activeListings} />
        <KpiCard label="Under Offer" value={kpis.underOffer} />
        <KpiCard label="Sold" value={kpis.sold} />
        <KpiCard label="Leads Captured" value={kpis.leadsCaptured} />
      </div>
      <div className="chart-row">
        <StatusDonut breakdown={byStatus} />
        <LocationBars breakdown={byLocation} />
      </div>
      <PlatformPerformanceCard asOf={platformPerf.asOf} rows={platformPerf.rows} />
    </>
  );
}
