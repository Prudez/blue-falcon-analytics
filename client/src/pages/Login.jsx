import { useState } from "react";
import { login, setAuthToken } from "../api.js";

// Shown instead of the app when the server requires a password and this
// browser has no valid token.
export default function Login({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const result = await login(password);
      setAuthToken(result.token);
      onSuccess();
    } catch (err) {
      setError(err.message);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand login-brand">
          Blue Falcon <span>Analytics</span>
        </div>
        <input
          className="table-input login-input"
          type="password"
          placeholder="Password"
          value={password}
          autoFocus
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error-banner">{error}</div>}
        <button className="button-primary login-button" type="submit" disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
