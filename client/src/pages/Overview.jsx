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
} from "../api.js";

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

function LocationBars({ breakdown }) {
  const data = breakdown.map((row) => ({
    location: row.location,
    count: row.count,
  }));
  return (
    <div className="card chart-card">
      <h2>Listings by Location</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="location" width={110} />
          <Tooltip />
          <Bar dataKey="count" fill="var(--chart-navy)" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Overview() {
  const [kpis, setKpis] = useState(null);
  const [byStatus, setByStatus] = useState(null);
  const [byLocation, setByLocation] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getKpiSummary(), getListingsByStatus(), getListingsByLocation()])
      .then(([summary, status, location]) => {
        setKpis(summary);
        setByStatus(status.breakdown);
        setByLocation(location.breakdown);
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
    </>
  );
}
