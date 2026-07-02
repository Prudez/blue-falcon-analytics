import { useEffect, useState } from "react";
import { getHealth } from "./api.js";

export default function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getHealth().then(setHealth).catch((err) => setError(err.message));
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Blue Falcon Analytics</h1>
      <h2>Phase 0 — Walking Skeleton</h2>
      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
      {!error && !health && <p>Checking backend…</p>}
      {health && (
        <p>
          Status: <strong>{health.ok ? "ok" : "down"}</strong> — DB time:{" "}
          <code>{health.timestamp}</code>
        </p>
      )}
    </main>
  );
}
