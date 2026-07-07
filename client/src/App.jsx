import { useEffect, useState } from "react";
import { getHealth, getAuthStatus } from "./api.js";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import Sales from "./pages/Sales.jsx";
import Listings from "./pages/Listings.jsx";
import Marketing from "./pages/Marketing.jsx";

const PAGES = [
  { key: "overview", label: "Overview" },
  { key: "sales", label: "Sales" },
  { key: "marketing", label: "Marketing" },
  { key: "listings", label: "Listings" },
];

export default function App() {
  const [page, setPage] = useState("overview");
  const [health, setHealth] = useState(null);
  // null = still checking; true = show the app; false = show the login.
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    getAuthStatus()
      .then((s) => setAuthed(!s.required || s.authenticated))
      .catch(() => setAuthed(true)); // backend down: let the app render its own error states
    getHealth()
      .then(() => setHealth("ok"))
      .catch(() => setHealth("down"));
  }, []);

  const current = PAGES.find((p) => p.key === page);

  if (authed === null) {
    return <p className="loading login-screen">Checking session…</p>;
  }
  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          Blue Falcon <span>Analytics</span>
        </div>
        <nav>
          {PAGES.map((p) => (
            <button
              key={p.key}
              className={`nav-item${p.key === page ? " active" : ""}`}
              onClick={() => setPage(p.key)}
            >
              {p.label}
            </button>
          ))}
        </nav>
        <div className="backend-status">
          <span className={`status-dot ${health ?? ""}`} />
          {health === "ok" ? "Backend connected" : health === "down" ? "Backend down" : "Checking…"}
        </div>
      </aside>
      <div className="main">
        <header className="header">
          <h1>{current.label}</h1>
          <div className="controls">
            {/* Both become functional in Phase 5. */}
            <button className="control" disabled title="Date filtering arrives in Phase 5">
              Last 30 days
            </button>
            <button className="control" disabled title="Export arrives in Phase 5">
              Export
            </button>
          </div>
        </header>
        <main className="content">
          {page === "overview" ? (
            <Overview />
          ) : page === "sales" ? (
            <Sales />
          ) : page === "listings" ? (
            <Listings />
          ) : (
            <Marketing />
          )}
        </main>
      </div>
    </div>
  );
}
