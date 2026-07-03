import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  getSalesOverTime,
  getLeadFunnel,
  getRevenueTrend,
  getPriceBands,
  getListingsByLocation,
  getRecentLeads,
  createLead,
  listProperties,
} from "../api.js";
import LocationBars from "../components/LocationBars.jsx";
import { LeadStage, LeadSource } from "../../../shared/contract.js";

const STAGE_LABELS = {
  lead: "Lead",
  viewing: "Viewing",
  offer: "Offer",
  closed: "Closed",
};

const SOURCE_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X",
  walk_in: "Walk-in",
  other: "Other",
};

// Capture a lead without leaving the dashboard. On save every Sales widget
// refreshes, so the funnel and trend react immediately.
function AddLeadForm({ properties, onAdded, onError }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [source, setSource] = useState("walk_in");
  const [stage, setStage] = useState("lead");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      onError("The lead needs a name.");
      return;
    }
    setSaving(true);
    try {
      await createLead({
        name: name.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        propertyId: propertyId === "" ? null : Number(propertyId),
        source,
        stage,
      });
      onError(null);
      setName("");
      setPhone("");
      setPropertyId("");
      setSource("walk_in");
      setStage("lead");
      onAdded();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="add-listing-form" onSubmit={submit}>
      <input
        className="table-input form-grow"
        type="text"
        placeholder="Lead name"
        value={name}
        disabled={saving}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="table-input"
        type="tel"
        placeholder="Phone (optional)"
        value={phone}
        disabled={saving}
        onChange={(e) => setPhone(e.target.value)}
      />
      <select
        className="table-select"
        value={propertyId}
        disabled={saving}
        onChange={(e) => setPropertyId(e.target.value)}
      >
        <option value="">No property yet</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        className="table-select"
        value={source}
        disabled={saving}
        onChange={(e) => setSource(e.target.value)}
      >
        {LeadSource.options.map((s) => (
          <option key={s} value={s}>
            {SOURCE_LABELS[s]}
          </option>
        ))}
      </select>
      <select
        className="table-select"
        value={stage}
        disabled={saving}
        onChange={(e) => setStage(e.target.value)}
      >
        {LeadStage.options.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      <button className="button-primary" type="submit" disabled={saving}>
        Add lead
      </button>
    </form>
  );
}

// "2026-06" → "Jun 2026" for axis ticks and tooltips.
function monthLabel(month) {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

// Compact KES amounts for axis ticks: 5000000 → "5M".
function kesCompact(value) {
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}K`;
  return `${value}`;
}

function OverTimeCard({ points }) {
  const data = points.map((p) => ({ ...p, label: monthLabel(p.month) }));
  return (
    <div className="card chart-card">
      <h2>Listings & Leads Over Time</h2>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <XAxis dataKey="label" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="listings"
            name="New listings"
            stroke="var(--chart-navy)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="leads"
            name="New leads"
            stroke="var(--chart-teal)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function FunnelCard({ stages }) {
  const total = stages[0]?.count ?? 0;
  const data = stages.map((s) => ({ name: STAGE_LABELS[s.stage], count: s.count }));
  return (
    <div className="card chart-card">
      <h2>Lead Funnel</h2>
      {total === 0 ? (
        <p className="loading">No leads yet. The funnel fills as leads are captured and staged.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} layout="vertical" margin={{ left: 12 }}>
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={70} />
            <Tooltip />
            <Bar dataKey="count" name="Leads reaching stage" fill="var(--chart-teal)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function RevenueCard({ points }) {
  const data = points.map((p) => ({ label: monthLabel(p.month), revenue: p.revenueKes }));
  return (
    <div className="card chart-card">
      <h2>Revenue Trend (KES)</h2>
      {data.length === 0 ? (
        <p className="loading">
          No closed sales yet. Revenue appears once sold properties have a sale date.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}>
            <XAxis dataKey="label" />
            <YAxis tickFormatter={kesCompact} />
            <Tooltip formatter={(value) => [`KES ${value.toLocaleString()}`, "Revenue"]} />
            <Bar dataKey="revenue" fill="var(--chart-navy)" radius={[6, 6, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function PriceBandsCard({ bands }) {
  const data = bands.map((b) => ({ band: b.band, count: b.count }));
  return (
    <div className="card chart-card">
      <h2>
        Sale Listings by Price Band (KES)
        <span className="card-note">rents and rates excluded</span>
      </h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <XAxis dataKey="band" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" name="Listings" fill="var(--chart-amber)" radius={[6, 6, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RecentLeadsCard({ leads }) {
  return (
    <div className="card full-width">
      <h2>Recent Leads</h2>
      {leads.length === 0 ? (
        <p className="loading">No leads yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Property</th>
              <th>Source</th>
              <th>Stage</th>
              <th>Captured</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  {lead.name}
                  {lead.phone && <span className="table-sub">{lead.phone}</span>}
                </td>
                <td>{lead.propertyName ?? "—"}</td>
                <td>{SOURCE_LABELS[lead.source] ?? lead.source}</td>
                <td>
                  <span className={`stage-pill stage-${lead.stage}`}>
                    {STAGE_LABELS[lead.stage]}
                  </span>
                </td>
                <td>
                  {new Date(lead.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Sales() {
  const [overTime, setOverTime] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [bands, setBands] = useState(null);
  const [byLocation, setByLocation] = useState(null);
  const [leads, setLeads] = useState(null);
  const [properties, setProperties] = useState([]);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);

  function load() {
    return Promise.all([
      getSalesOverTime(),
      getLeadFunnel(),
      getRevenueTrend(),
      getPriceBands(),
      getListingsByLocation(),
      getRecentLeads(),
    ])
      .then(([ot, fu, re, ba, lo, le]) => {
        setOverTime(ot.points);
        setFunnel(fu.stages);
        setRevenue(re.points);
        setBands(ba.bands);
        setByLocation(lo.breakdown);
        setLeads(le.leads);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    listProperties()
      .then((body) => setProperties(body.properties))
      .catch(() => setProperties([]));
  }, []);

  if (error) {
    return <div className="error-banner">Could not load sales analytics: {error}</div>;
  }
  if (!overTime) {
    return <p className="loading">Loading sales analytics…</p>;
  }

  return (
    <>
      {formError && <div className="error-banner">Could not save: {formError}</div>}
      <div className="card full-width">
        <h2>Add a Lead</h2>
        <AddLeadForm properties={properties} onAdded={load} onError={setFormError} />
      </div>
      <div className="chart-row">
        <OverTimeCard points={overTime} />
        <FunnelCard stages={funnel} />
      </div>
      <div className="chart-row">
        <RevenueCard points={revenue} />
        <PriceBandsCard bands={bands} />
        <LocationBars breakdown={byLocation} />
      </div>
      <RecentLeadsCard leads={leads} />
    </>
  );
}
