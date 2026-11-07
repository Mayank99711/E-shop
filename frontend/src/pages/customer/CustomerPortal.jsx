import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CustomerAuth, useCustomerAuth } from "../auth/CustomerAuth.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import CustomerLayout from "../../layouts/CustomerLayout.jsx";
import { useApiHealth } from "../../hooks/useApiHealth.js";
import Storefront from "./Storefront.jsx";

export default function CustomerPortal() {
  const apiState = useApiHealth();
  const auth = useCustomerAuth();
  const openSignIn = useCallback(() => auth.open("login"), [auth.open]);
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

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
      <div className="esh-announcement"><span>✧ Discover independent shops</span><span>♡ Save your favourites</span><span>◈ Explore E-Shop</span></div>
      <header className="portal-nav">
        <div className="market-header-brand">
          <Link className="brand" to="/" aria-label="E-Shop home"><span className="brand-mark">E</span><span>E-Shop</span></Link>
        </div>
        <div id="esh-desktop-nav-slot" className="esh-desktop-nav-slot" />
        <form className="market-search" role="search" onSubmit={submitSearch}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
          <label className="visually-hidden" htmlFor="market-search-input">Search products and shops</label>
          <input id="market-search-input" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search products and discover shops..." />
          <button type="submit" aria-label="Search products and shops">⌕ <span>Search</span></button>
        </form>
        <div className="nav-actions">
          <span className={`api-indicator ${apiState}`} role="status"><span className="indicator-dot" />API {apiState}</span>
          {!auth.user && <button className="btn btn-outline-primary btn-sm" onClick={openSignIn}>Sign in</button>}
          {auth.user && <details className="market-account">
            <summary><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg><span>{auth.user.name}</span></summary>
            <div className="market-account-menu">
              <Link to="/profile">My account</Link><Link to="/my-orders">My orders</Link><Link to="/addresses">Addresses</Link>
              <button type="button" onClick={auth.logout}>Sign out</button>
            </div>
          </details>}
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
      <Storefront user={auth.loading ? null : auth.user} auth={auth} openSignIn={() => auth.open("login")} mobileMenuOpen={mobileMenuOpen} onNavigate={() => setMobileMenuOpen(false)} />
      {apiState !== "connected" && <p className="api-banner" role="status">{apiState === "checking" ? "Checking connection to E-Shop…" : "The E-Shop API is unavailable. Some marketplace actions may not load."}</p>}
    </CustomerLayout>
  );
}
