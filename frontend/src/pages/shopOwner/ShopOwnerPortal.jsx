import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OwnerActivation, PasswordReset, PortalAuth, usePortalAuth } from "../auth/OwnerAuth.jsx";
import OwnerWorkspace from "./OwnerWorkspace.jsx";
import EmployeeWorkspace from "./EmployeeWorkspace.jsx";
import EmployeeActivation from "./EmployeeActivation.jsx";
import ShopOwnerLayout from "../../layouts/ShopOwnerLayout.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { shopOwnerNavigation as navigation, shopOwnerBottomNavigation as bottomNavigation } from "./navigation.js";

export default function ShopOwnerPortal() {
  const auth = usePortalAuth("SHOP_OWNER");
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const loginPage = location.pathname === "/shop/login";
  const resetPage = location.pathname === "/shop/reset-password";
  const activationPage = location.pathname === "/shop/activate-account";
  const employeeActivationPage = location.pathname.endsWith("/activate-employee");

  useEffect(() => {
    if (loginPage) auth.setDialogOpen(true);
    if (auth.user && (loginPage || location.pathname === "/shop")) navigate("/shop/dashboard", { replace: true });
  }, [auth.user, auth.setDialogOpen, loginPage, location.pathname, navigate]);

  if (employeeActivationPage) return <EmployeeActivation />;
  if (auth.user?.role === "SHOP_EMPLOYEE") return <EmployeeWorkspace user={auth.user} onLogout={auth.logout} />;
  if (auth.user && !resetPage && !activationPage) {
  if (auth.user.role === "SHOP_EMPLOYEE") {
    return (
      <main className="portal-shell">
        <section className="welcome-panel">
          <div className="welcome-copy">
            <span className="eyebrow">EMPLOYEE ACCESS</span>

            <h1>Welcome, {auth.user.name}</h1>

            <p>
              You are signed in to the Shop Owner Portal
              as an employee.
            </p>

            <p>
              Your available modules will be based on
              permissions assigned by your Shop Owner.
            </p>

            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={auth.logout}
            >
              Sign out
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <ShopOwnerLayout
      user={auth.user}
      navigation={navigation}
      bottomNavigation={bottomNavigation}
      onLogout={auth.logout}
    >
      <OwnerWorkspace user={auth.user} />
    </ShopOwnerLayout>
  );
}
  return (
    <main className="portal-shell">
      <header className="portal-nav">
        <a className="brand" href="/" aria-label="E-Shop customer home"><span className="brand-mark">E</span>E-Shop</a>
        <div className="nav-actions"><PortalAuth auth={auth} /><button className="btn btn-outline-secondary btn-sm" onClick={toggleTheme}>{theme === "dark" ? "Light mode" : "Dark mode"}</button></div>
      </header>
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="eyebrow">SHOP OWNER PORTAL</span><h1>Your shop,<br /><span>all in one place.</span></h1>
          <p>Manage your products, inventory and fulfilment through one workspace built for your shop.</p>
          <div className="welcome-actions">
            <button className="btn btn-primary btn-lg" type="button" onClick={() => auth.setDialogOpen(true)}>Owner sign in</button>
            {!activationPage && <OwnerActivation />}
          </div>
        </div>
      </section>
      {resetPage && <PasswordReset />}
      {activationPage && <OwnerActivation />}
    </main>
  );
}
