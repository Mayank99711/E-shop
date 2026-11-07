import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { authService } from "../../../services/authService.js";
export default function EmployeeActivation() {
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setError(""); setBusy(true);
    try { await authService.activateEmployee(token, password); setDone(true); setPassword(""); setConfirmPassword(""); }
    catch (e) { setError(e.message || "Activation failed."); }
    finally { setBusy(false); }
  }
  return <main className="portal-shell"><section className="welcome-panel"><div className="welcome-copy" style={{ maxWidth: 480 }}>
    <span className="eyebrow">SHOP EMPLOYEE ACCOUNT</span><h1>Activate your employee login</h1>
    {done ? <><p>Account activated. Select Employee on the shop login page.</p><Link className="btn btn-primary" to="/shop/login">Go to shop login</Link></>
      : !/^[a-f0-9]{64}$/i.test(token) ? <p>Invalid invitation link. Ask your shop owner for a new invitation.</p>
      : <form className="workspace-form" onSubmit={submit}>
        <label>New password<input className="form-control" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label>Confirm password<input className="form-control" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Activating..." : "Activate account"}</button>
      </form>}
  </div></section></main>;
}
