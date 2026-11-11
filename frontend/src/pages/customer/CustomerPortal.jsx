import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CustomerAuth, useCustomerAuth } from "../auth/CustomerAuth.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
// import { useAuth } from "../../context/AuthContext.jsx";
import CustomerLayout from "../../layouts/CustomerLayout.jsx";
import { useApiHealth } from "../../hooks/useApiHealth.js";
import Storefront from "./Storefront.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
export default function CustomerPortal() {
  const apiState = useApiHealth();
const auth = useCustomerAuth();
const session = useAuth();
const navigate = useNavigate();
const { activePortal } = session;

const isStaffPortalActive =
  activePortal === "shop-owner" ||
  activePortal === "super-admin";

const staffDashboardPath =
  activePortal === "super-admin"
    ? "/admin/dashboard"
    : "/shop/dashboard";

const portalVisitor =
  session.user?.role === "SUPER_ADMIN" ||
  session.user?.role === "SHOP_OWNER" ||
  session.user?.role === "SHOP_EMPLOYEE"
    ? session.user
    : null;

const dashboardPath =
  portalVisitor?.role === "SUPER_ADMIN"
    ? "/admin/dashboard"
    : "/shop/dashboard";
  const openSignIn = useCallback(() => {
  if (isStaffPortalActive) {
    navigate(staffDashboardPath);
    return;
  }

  auth.open("login");
}, [isStaffPortalActive, staffDashboardPath, navigate, auth.open]);
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [headerHidden, setHeaderHidden] = useState(false);
const lastScrollY = useRef(0);

useEffect(() => {
  lastScrollY.current = window.scrollY;

  const handleScroll = () => {
    const currentScrollY = Math.max(0, window.scrollY);
    const previousScrollY = lastScrollY.current;
    const scrollDifference = currentScrollY - previousScrollY;

    // Always display navbar near the top of the page.
    if (currentScrollY <= 80) {
      setHeaderHidden(false);
    } else if (Math.abs(scrollDifference) >= 5) {
      // Down = hide, Up = show.
      setHeaderHidden(scrollDifference > 0);
    }

    lastScrollY.current = currentScrollY;
  };

  window.addEventListener("scroll", handleScroll, {
    passive: true,
  });

  return () => {
    window.removeEventListener("scroll", handleScroll);
  };
}, []);
  const location = useLocation();


  useEffect(() => {
    setSearchText(new URLSearchParams(location.search).get("q") || "");
  }, [location.search]);

  function submitSearch(event) {
    event.preventDefault();
    const query = searchText.trim();
    navigate({ pathname: "/", search: query ? `?${new URLSearchParams({ q: query })}` : "" });
    setMobileMenuOpen(false);
  }

  return (
    <CustomerLayout apiState={apiState}>
      <div className="esh-announcement">
  <span>Discover independent shops</span>
  <span>Save your favourites</span>
  <span>Explore E-Shop</span>
</div>
      <header
  className={`portal-nav esh-smart-header ${
    headerHidden && !mobileMenuOpen ? "esh-header-hidden" : ""
  }`}
>
        <div className="market-header-brand">
          <Link className="brand" to="/" aria-label="E-Shop home"><span className="brand-mark">E</span><span>E-Shop</span></Link>
        </div>
        <div id="esh-desktop-nav-slot" className="esh-desktop-nav-slot" />
        <form className="market-search" role="search" onSubmit={submitSearch}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
          <label className="visually-hidden" htmlFor="market-search-input">Search products and shops</label>
          <input id="market-search-input" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search products and discover shops..." />

<button
  type="submit"
  aria-label="Search products and shops"
>
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m16 16 5 5" />
  </svg>

  <span>Search</span>
</button>

        </form>
        <div className="nav-actions">
          <span className={`api-indicator ${apiState}`} role="status"><span className="indicator-dot" />API {apiState}</span>
          {activePortal === "shop-owner" ? (
  <Link
    to="/shop/dashboard"
    className="btn btn-outline-primary btn-sm"
  >
    Back to Shop Owner Dashboard
  </Link>
) : activePortal === "super-admin" ? (
  <Link
    to="/admin/dashboard"
    className="btn btn-outline-primary btn-sm"
  >
    Back to Admin Dashboard
  </Link>
) : (
  !session.loading &&
  !auth.user &&
  !portalVisitor && (
    <button
      className="btn btn-outline-primary btn-sm"
      onClick={openSignIn}
    >
      Sign in
    </button>
  )
)}
          {auth.user && <details className="market-account">
            <summary><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg><span>{auth.user.name}</span></summary>
            <div className="market-account-menu">
              <Link to="/profile">My account</Link><Link to="/my-orders">My orders</Link><Link to="/addresses">Addresses</Link>
              <button type="button" onClick={auth.logout}>Sign out</button>
            </div>
                    </details>}

          {/* CHANGE 4 Ã¢â‚¬â€ Admin / Shop Owner account menu */}
          {portalVisitor && (
            <details className="market-account">
              <summary>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 20a7 7 0 0 1 14 0" />
                </svg>
                <span>{portalVisitor.name || "My Account"}</span>
              </summary>

              <div className="market-account-menu">
                <Link to={dashboardPath}>Back to Dashboard</Link>

                <span className="market-account-role">
                  {portalVisitor.role === "SUPER_ADMIN"
                    ? "Super Admin Ã¢â‚¬â€ Browse Only"
                    : portalVisitor.role === "SHOP_EMPLOYEE"
                      ? "Shop Employee Ã¢â‚¬â€ Browse Only"
                      : "Shop Owner Ã¢â‚¬â€ Browse Only"}
                </span>
              </div>
            </details>
          )}
          <button
            className="esh-theme-icon-button"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.5 14.1A8.7 8.7 0 0 1 9.9 3.5 8.8 8.8 0 1 0 20.5 14.1Z" />
              </svg>
            )}
          </button>
          <button className="mobile-menu-toggle" type="button" aria-label={mobileMenuOpen ? "Close menu" : "Open menu"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{mobileMenuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <><path d="M4 7h16M4 12h16M4 17h16" /></>}</svg>
          </button>
        </div>
      </header>
      <CustomerAuth auth={auth} hideActions />

<Storefront
  user={
    isStaffPortalActive
      ? null
      : auth.loading
        ? null
        : auth.user
  }
  auth={auth}
  openSignIn={openSignIn}
  mobileMenuOpen={mobileMenuOpen}
  onNavigate={() => setMobileMenuOpen(false)}
/>

      {apiState !== "connected" && <p className="api-banner" role="status">{apiState === "checking" ? "Checking connection to E-ShopÃ¢â‚¬Â¦" : "The E-Shop API is unavailable. Some marketplace actions may not load."}</p>}
    </CustomerLayout>
  );
}
