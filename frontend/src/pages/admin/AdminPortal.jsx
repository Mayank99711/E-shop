import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PasswordReset, PortalAuth, usePortalAuth } from "../auth/AdminAuth.jsx";
import AdminWorkspace from "./AdminWorkspace.jsx";
import AdminLayout from "../../layouts/AdminLayout.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { adminNavigation as navigation } from "./navigation.js";

export default function AdminPortal() {
  const auth = usePortalAuth("SUPER_ADMIN");
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const loginPage = location.pathname === "/admin/login";
  const resetPage = location.pathname === "/admin/reset-password";

  useEffect(() => {
    if (loginPage) auth.setDialogOpen(true);
    if (auth.user && (loginPage || location.pathname === "/admin")) navigate("/admin/dashboard", { replace: true });
  }, [auth.user, auth.setDialogOpen, loginPage, location.pathname, navigate]);

  if (auth.user && !resetPage) {
    return <AdminLayout user={auth.user} navigation={navigation} onLogout={auth.logout}><AdminWorkspace /></AdminLayout>;
  }
  return (
    <main className="portal-shell">
      <header className="portal-nav">
        <a className="brand" href="/" aria-label="E-Shop customer home"><span className="brand-mark">E</span>E-Shop</a>
        <div className="nav-actions"><PortalAuth auth={auth} /><button className="btn btn-outline-secondary btn-sm" onClick={toggleTheme}>{theme === "dark" ? "Light mode" : "Dark mode"}</button></div>
      </header>
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="eyebrow">SUPER ADMIN PORTAL</span><h1>One platform.<br /><span>Clear oversight.</span></h1>
          <p>Govern shops and shared marketplace data with the tools to keep every part of E-Shop connected.</p>
          <button className="btn btn-primary btn-lg" type="button" onClick={() => auth.setDialogOpen(true)}>Secure sign in</button>
          <p className="security-note">Super Admin accounts are provisioned through a controlled setup. Public registration is disabled by design.</p>
        </div>
      </section>
      {resetPage && <PasswordReset />}
    </main>
  );
}
