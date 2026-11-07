import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authService } from "../../services/authService.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useRetryAfterCooldown } from "../../hooks/useRetryAfterCooldown.js";
import PortalSwitchLinks from "../../components/common/PortalSwitchLinks.jsx";
const CUSTOMER_EMAIL_KEY = "eshop_customer_remembered_email";

function initialMode() {
  return new URLSearchParams(window.location.search).has("token") ? "reset" : "login";
}

export function useCustomerAuth() {
  const session = useAuth();
  const submissionInProgress = useRef(false);
  const { retrySecondsRemaining, blockOnRateLimit } = useRetryAfterCooldown();
  const user = session.user?.role === "CUSTOMER" ? session.user : null;
  const [mode, setMode] = useState(initialMode);
  const [dialogOpen, setDialogOpen] = useState(() => new URLSearchParams(window.location.search).has("token"));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(
  () => localStorage.getItem(CUSTOMER_EMAIL_KEY) || ""
);

const [password, setPassword] = useState("");
const [showPassword, setShowPassword] = useState(false);

const [submitting, setSubmitting] = useState(false);
const [rememberMe, setRememberMe] = useState(
() => Boolean(localStorage.getItem(CUSTOMER_EMAIL_KEY))
);
const [code, setCode] = useState("");
const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("token") || "");

  function open(nextMode = "login") {
    setError("");
    setNotice("");
    setMode(nextMode);
    setDialogOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    if (submissionInProgress.current || retrySecondsRemaining > 0) return;
    submissionInProgress.current = true;
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      if (mode === "register") {
        const result = await authService.registerCustomer({ name, email, password });
        setNotice(result.message);
        setMode("verify");
        return;
      }
      if (mode === "verify") {
        const result = await authService.verifyCustomerEmail(email, code);
        setNotice(result.message);
        setPassword("");
        setMode("login");
        return;
      }
      if (mode === "forgot") {
        const result = await authService.forgotPassword(email);
        setNotice(result.message);
        return;
      }
      if (mode === "reset") {
        const result = await authService.resetPassword(resetToken, password);
        setNotice(result.message);
        setPassword("");
        setResetToken("");
        window.history.replaceState({}, "", window.location.pathname);
        setMode("login");
        return;
      }

      await session.login("CUSTOMER", email, password, rememberMe);

      if (rememberMe) {
        localStorage.setItem(CUSTOMER_EMAIL_KEY, email.trim());
      } else {
        localStorage.removeItem(CUSTOMER_EMAIL_KEY);
      }

      setPassword("");
      setDialogOpen(false);
    } catch (requestError) {
      setError(requestError.message);
      blockOnRateLimit(requestError);
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
    }
  }

  async function resendCode() {
    setError("");
    setNotice("");
    try {
      const result = await authService.resendCustomerVerification(email);
      setNotice(result.message);
    } catch (requestError) {
      setError(requestError.message);
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

  return {
    user, loading: session.loading, mode, dialogOpen, error, notice, name, email, password, code, resetToken,
    showPassword, rememberMe, submitting, retrySecondsRemaining, setShowPassword, setRememberMe,
    setMode, setDialogOpen, setName, setEmail, setPassword, setCode, open, submit, resendCode, logout
  };
}

export function CustomerAuth({ auth, hideActions = false }) {
  const { mode } = auth;
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const wasOpen = useRef(false);
  const titles = {
    login: "Welcome back",
    register: "Create your account",
    verify: "Verify your email",
    forgot: "Reset your password",
    reset: "Choose a new password"
  };

  useEffect(() => {
    if (!auth.dialogOpen) {
      if (wasOpen.current) {
        wasOpen.current = false;
        previousFocusRef.current?.focus();
        previousFocusRef.current = null;
      }
      return undefined;
    }

    if (!wasOpen.current) {
      const activeElement = document.activeElement;
      previousFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
      wasOpen.current = true;
    }
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        auth.setDialogOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)].filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [auth.dialogOpen, auth.setDialogOpen]);

  useEffect(() => {
    if (!auth.dialogOpen) return undefined;
    const focusFrame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const inputId = mode === "register"
        ? "#customer-name"
        : mode === "verify"
          ? "#customer-code"
          : mode === "reset"
            ? "#customer-password"
            : "#customer-email";
      const initialFocus = dialog?.querySelector(inputId) || dialog?.querySelector(".auth-close");
      if (initialFocus instanceof HTMLElement) initialFocus.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(focusFrame);
  }, [auth.dialogOpen, mode]);

  return (
    <>
      {!hideActions && (auth.loading
        ? <span className="muted-copy" role="status">Checking session…</span>
        : auth.user
        ? <div className="auth-user"><span>Hi, {auth.user.name}</span><button className="auth-signout" onClick={auth.logout}>Sign Out</button></div>
        : <div className="customer-auth-actions">
            <button className="btn btn-outline-primary btn-sm" onClick={() => auth.open("login")}>Sign in</button>
            <button className="btn btn-primary btn-sm" onClick={() => auth.open("register")}>Create account</button>
          </div>)}
      {auth.dialogOpen && createPortal(
        <div className="auth-backdrop customer-auth-backdrop">
          <section ref={dialogRef} className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-auth-title" tabIndex="-1">
            <PortalSwitchLinks current="customer" />
            <button className="auth-close" aria-label="Close account dialog" onClick={() => auth.setDialogOpen(false)}>×</button>
            <span className="eyebrow">CUSTOMER ACCOUNT</span>
            <h2 id="customer-auth-title">{titles[mode]}</h2>
            <p>{mode === "verify" ? "Enter the six-digit code sent to your email address." : "Your E-Shop account keeps your shopping and orders together."}</p>
            <form onSubmit={auth.submit} autoComplete="on">
              {mode === "register" && <>
                <label htmlFor="customer-name">Full name</label>
                <input id="customer-name" autoComplete="name" required minLength="2" maxLength="100" value={auth.name} onChange={(event) => auth.setName(event.target.value)} />
              </>}
              {mode !== "reset" && <>
                <label htmlFor="customer-email">Email</label>
                <input id="customer-email" name="username" type="email" autoComplete="username" required value={auth.email} onChange={(event) => auth.setEmail(event.target.value)} />
              </>}
              {mode === "verify" && <>
                <label htmlFor="customer-code">Six-digit code</label>
                <input id="customer-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" required value={auth.code} onChange={(event) => auth.setCode(event.target.value)} />
              </>}
              {["login", "register", "reset"].includes(mode) && <>
                <label htmlFor="customer-password">
  {mode === "reset" ? "New password" : "Password"}
</label>

<div className="password-field">
  <input
    id="customer-password"
    name="password"
    type={auth.showPassword ? "text" : "password"}
    autoComplete={mode === "login" ? "current-password" : "new-password"}
    minLength={mode === "login" ? undefined : 12}
    maxLength="128"
    required
    value={auth.password}
    onChange={(event) => auth.setPassword(event.target.value)}
  />

        <button
          type="button"
          className="password-toggle"
          aria-label={auth.showPassword ? "Hide password" : "Show password"}
          aria-pressed={auth.showPassword}
          onClick={() => auth.setShowPassword((value) => !value)}
        >
          {auth.showPassword ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
                {mode === "login" && <label className="remember-me"><input type="checkbox" checked={auth.rememberMe} onChange={(event) => auth.setRememberMe(event.target.checked)} /> Remember me</label>}
                {mode === "register" && <small className="password-help">Use at least 12 characters.</small>}
              </>}
              {auth.error && <p className="auth-error" role="alert">{auth.error}</p>}
              {auth.notice && <p className="auth-notice" role="status">{auth.notice}</p>}
              <button className="btn btn-primary w-100" type="submit" disabled={auth.submitting || auth.retrySecondsRemaining > 0}>
                {auth.submitting ? "Please wait..." : auth.retrySecondsRemaining > 0 ? `Try again in ${auth.retrySecondsRemaining}s` : titles[mode]}
              </button>
            </form>
            <div className="auth-links">
              {mode === "login" && <>
                <button onClick={() => auth.setMode("forgot")}>Forgot password?</button>
                <span>New here? <button onClick={() => auth.setMode("register")}>Create an account</button></span>
              </>}
              {mode === "register" && <span>Already registered? <button onClick={() => auth.setMode("login")}>Sign in</button></span>}
              {mode === "verify" && <button onClick={auth.resendCode}>Resend verification code</button>}
              {["forgot", "reset"].includes(mode) && <button onClick={() => auth.setMode("login")}>Back to sign in</button>}
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  );
}
