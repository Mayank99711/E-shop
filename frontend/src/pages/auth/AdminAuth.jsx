import { useRef, useState } from "react";
import { authService } from "../../services/authService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useRetryAfterCooldown } from "../../hooks/useRetryAfterCooldown.js";
import PortalSwitchLinks from "../../components/common/PortalSwitchLinks.jsx";
const ADMIN_EMAIL_KEY = "eshop_admin_remembered_email";
export function usePortalAuth(role) {
  const session = useAuth();
  const retryCooldown = useRetryAfterCooldown();
  const user = session.user?.role === role ? session.user : null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState("");

  async function login(email, password, rememberMe = false) {
    setError("");
    try {
      await session.login(role, email, password, rememberMe);
      setDialogOpen(false);
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    }
  }

  async function logout() {
    setError("");
    try {
      await session.logout();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return { user, dialogOpen, error, setDialogOpen, login, logout, ...retryCooldown };
}

export function PortalAuth({ auth }) {
  const [email, setEmail] = useState(
  () => localStorage.getItem(ADMIN_EMAIL_KEY) || ""
);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(
  () => Boolean(localStorage.getItem(ADMIN_EMAIL_KEY))
);
  const [submitting, setSubmitting] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const submissionInProgress = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submissionInProgress.current || auth.retrySecondsRemaining > 0) return;
    submissionInProgress.current = true;
    setSubmitting(true);
    setFormError("");
    setNotice("");
    try {
      if (forgot) {
        const result = await authService.forgotPassword(email);
        setNotice(result.message);
      } else {
        await auth.login(email, password, rememberMe);

          if (rememberMe) {
            localStorage.setItem(ADMIN_EMAIL_KEY, email.trim());
          } else {
            localStorage.removeItem(ADMIN_EMAIL_KEY);
          }

          setPassword("");
      }
    } catch (requestError) {
      auth.blockOnRateLimit(requestError);
      if (forgot) setFormError(requestError.message);
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      {auth.user
        ? <div className="auth-user"><span>Hi, {auth.user.name}</span><button className="btn btn-outline-secondary btn-sm" onClick={auth.logout}>Sign out</button></div>
        : <button className="btn btn-primary btn-sm" onClick={() => auth.setDialogOpen(true)}>Secure sign in</button>}
      {auth.dialogOpen && (
        <div className="auth-backdrop">
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-auth-title">
            <button className="auth-close" aria-label="Close sign-in dialog" onClick={() => auth.setDialogOpen(false)}>×</button>
          <PortalSwitchLinks current="super-admin" />
            <span className="eyebrow">SUPER ADMIN ACCESS</span>
            <h2 id="admin-auth-title">{forgot ? "Reset your password" : "Platform sign in"}</h2>
            <p>{forgot ? "If an eligible account exists, reset instructions will be sent when email delivery is available." : "Use your provisioned administrator account."}</p>
            <form onSubmit={handleSubmit} autoComplete="on">
              <label htmlFor="admin-email">Email</label>
              <input id="admin-email" name="username" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
              {!forgot && <>
                <label htmlFor="admin-password">Password</label>
                <div className="password-field">
                  <input id="admin-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
                  <button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
                <label className="remember-me"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /> Remember me</label>
              </>}
              {auth.error && !forgot && <p className="auth-error" role="alert">{auth.error}</p>}
              {formError && <p className="auth-error" role="alert">{formError}</p>}
              {notice && <p className="auth-notice" role="status">{notice}</p>}
              <button className="btn btn-primary w-100" disabled={submitting || auth.retrySecondsRemaining > 0}>
                {submitting ? "Please wait..." : auth.retrySecondsRemaining > 0 ? `Try again in ${auth.retrySecondsRemaining}s` : forgot ? "Send reset link" : "Sign in securely"}
              </button>
            </form>
            <div className="auth-dialog-links">
              {!forgot ? <button onClick={() => { setForgot(true); setNotice(""); setFormError(""); }}>Forgot password?</button> : <button onClick={() => setForgot(false)}>Back to sign in</button>}
              {!forgot && <small>Administrator accounts are provisioned through a controlled setup. Public registration is disabled.</small>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function PasswordReset() {
  const [token, setToken] = useState(() => window.location.pathname.endsWith("/reset-password")
    ? new URLSearchParams(window.location.search).get("token") || ""
    : "");
  const [dialogOpen, setDialogOpen] = useState(Boolean(token));
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!dialogOpen) return null;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await authService.resetPassword(token, password);
      setMessage(result.message);
      setToken("");
      setPassword("");
      window.history.replaceState({}, "", window.location.pathname);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-backdrop">
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-reset-title">
        <span className="eyebrow">ACCOUNT SECURITY</span>
        <h2 id="admin-reset-title">Set a new password</h2>
        {message
          ? <><p className="auth-notice" role="status">{message}</p><button className="btn btn-outline-primary w-100" onClick={() => { setDialogOpen(false); window.history.replaceState({}, "", "/"); }}>Back to sign in</button></>
          : <form onSubmit={submit}>
              <label htmlFor="admin-reset-password">New password</label>
              <input id="admin-reset-password" type="password" autoComplete="new-password" minLength="12" maxLength="128" required value={password} onChange={(event) => setPassword(event.target.value)} />
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="btn btn-primary w-100" disabled={busy}>{busy ? "Updating..." : "Update password"}</button>
            </form>}
      </section>
    </div>
  );
}
