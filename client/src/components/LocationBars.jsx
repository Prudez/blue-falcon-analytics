import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Shared between Overview and Sales: same widget, same data, two pages.
export default function LocationBars({ breakdown }) {
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
