import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient.js";
import "./EmployeeWorkspace.css";
import DeliveryAssociatePortal from "./DeliveryAssociatePortal.jsx";
import EmployeeOrders from "./EmployeeOrders.jsx";
import EmployeeCatalog from "./EmployeeCatalog.jsx";
import EmployeeOperations from "./EmployeeOperations.jsx";
import EmployeeFinance from "../../features/employee/finance/EmployeeFinance.jsx";

const MODULES = [
  { key: "dashboard", title: "Dashboard", icon: "▦", description: "Shop overview and summary", view: "dashboard.view" },
  { key: "orders", title: "Orders", icon: "▤", description: "Track and manage shop orders",view: "orders.view", manage: "orders.manage" },
  { key: "products", title: "Products", icon: "◈", description: "View and manage product listings", view: "products.view", manage: "products.manage" },
  { key: "inventory", title: "Inventory", icon: "▥", description: "Monitor stock and adjustments", view: "inventory.view", manage: "inventory.manage" },
  { key: "customers", title: "Customers", icon: "♙", description: "Customer records and details", view: "customers.view", manage: "customers.manage" },
  { key: "delivery", title: "Delivery", icon: "➜", description: "Shipping and fulfilment status", view: "delivery.view", manage: "delivery.manage" },
  { key: "payments", title: "Payments", icon: "▣", description: "Payment visibility", view:"payments.view" },
  { key: "reports", title: "Reports", icon: "▧", description: "Shop performance reports", view: "reports.view" },
  { key: "employees", title: "Employees", icon: "♧", description: "Employee directory and actions", view: "employees.view", manage: "employees.manage" },
];

const ROLE_LABELS = {
  SHOP_MANAGER: "Shop Manager",
  SALES_STAFF: "Sales Staff",
  INVENTORY_STAFF: "Inventory Staff",
  DELIVERY_ASSOCIATE: "Delivery Associate",
};

export default function EmployeeWorkspace({ user, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState("overview");
  const [selectedModule, setSelectedModule] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest("/api/employee/me", { portal: "shop-owner" });
      setProfile(response?.data || response);
    } catch (requestError) {
      setProfile(null);
      setError(requestError?.message || "Unable to load your access. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const fetchProfile = async () => {
      try {
        const response = await apiRequest("/api/employee/me", { portal: "shop-owner" });
        if (active) setProfile(response?.data || response);
      } catch (requestError) {
        if (active) setError(requestError?.message || "Unable to load your access.");
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchProfile();
    return () => { active = false; };
  }, []);

  const granted = useMemo(() => new Set(Array.isArray(profile?.permissions) ? profile.permissions : []), [profile]);
  const accessibleModules = useMemo(() => MODULES.filter((module) => granted.has(module.view)), [granted]);
  const manageCount = accessibleModules.filter((module) => module.manage && granted.has(module.manage)).length;
  const displayName = user?.name || profile?.name || "Employee";
  const firstName = displayName.trim().split(/\s+/)[0] || "Employee";
  const roleName = ROLE_LABELS[profile?.employeeRole] || profile?.employeeRole || "Employee";
  const initial = firstName.charAt(0).toUpperCase();

  const navigate = (page) => {
    setActivePage(page);
    setSelectedModule(null);
    setMobileMenuOpen(false);
  };

  if (profile?.employeeRole === "DELIVERY_ASSOCIATE") {
    return <DeliveryAssociatePortal user={user} onLogout={onLogout} />;
  }
  return (
    <div className="employee-portal">
      <aside className={`employee-sidebar ${mobileMenuOpen ? "is-open" : ""}`} aria-label="Employee navigation">
        <div className="employee-brand"><span className="employee-brand-mark">E</span><span>E-Shop <small>Employee Portal</small></span></div>
        <p className="employee-side-caption">WORKSPACE</p>
        <nav className="employee-side-nav">
          <button className={activePage === "overview" ? "is-active" : ""} onClick={() => navigate("overview")} type="button"><span>▦</span> Overview</button>
          <button className={activePage === "access" ? "is-active" : ""} onClick={() => navigate("access")} type="button"><span>◈</span> My permissions</button>
          <button className={activePage === "account" ? "is-active" : ""} onClick={() => navigate("account")} type="button"><span>♙</span>My account</button>
        </nav>
        <p className="employee-side-caption employee-module-caption">MY MODULES</p>
        <nav className="employee-side-nav">
          {accessibleModules.length ? accessibleModules.map((module) => (
            <button key={module.key} type="button" className={selectedModule === module.key ?"is-active" : ""}
              onClick={() => { setSelectedModule(module.key); setActivePage("module"); setMobileMenuOpen(false); }}>
              <span>{module.icon}</span> {module.title}
            </button>
          )) : <p className="employee-sidebar-empty">No assigned modules</p>}
        </nav>
        <div className="employee-sidebar-bottom">
          <div className="employee-side-profile"><span className="employee-avatar">{initial}</span><span><strong>{displayName}</strong><small>{roleName}</small></span></div>
          <button className="employee-logout" type="button" onClick={onLogout}>↪ <span>Signout</span></button>
        </div>
      </aside>

      {mobileMenuOpen && <button className="employee-mobile-scrim" type="button" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />}

      <div className="employee-main">
        <header className="employee-topbar">
          <div className="employee-topbar-left">
            <button type="button" className="employee-menu-toggle" aria-label="Open navigation" onClick={() => setMobileMenuOpen(true)}>☰</button>
            <span className="employee-breadcrumb">Workspace <span>/</span> {activePage === "overview" ? "Overview" : activePage === "access"? "My permissions" : activePage === "account" ? "My account" : MODULES.find((m) => m.key === selectedModule)?.title || "Module"}</span>
          </div>
          <div className="employee-topbar-right"><span className="employee-active-pill"><span/> Active employee</span><span className="employee-top-avatar" title={displayName}>{initial}</span></div>
        </header>

        <main className="employee-content">
          {loading ? (
            <section className="employee-panel" role="status"><h2>Loading your workspace…</h2><p>Checking your assigned permissions.</p></section>
          ) : error ? (
            <section className="employee-panel" role="alert"><h2>Unable to load workspace</h2><p>{error}</p><button type="button" className="employee-primary-btn" onClick={loadProfile}>Try again</button></section>
          ) : activePage === "account" ? (
            <><div className="employee-page-heading"><span className="employee-eyebrow">MY ACCOUNT</span><h1>Account details</h1><p>Your account and role information.</p></div>
              <section className="employee-panel employee-account-panel"><div className="employee-account-avatar">{initial}</div><div><h2>{displayName}</h2><p>{user?.email || profile?.email || "Email not available"}</p><span className="employee-role-tag">{roleName}</span></div></section>
              <section className="employee-panel"><h3>Access control</h3><p>Permissions are assigned by your shop owner. Contact them if youneed additional access.</p><button type="button" className="employee-secondary-btn" onClick={() => navigate("access")}>Review my permissions</button></section></>
          ) : activePage === "access" ? (
            <><div className="employee-page-heading"><span className="employee-eyebrow">ACCESS MANAGEMENT</span><h1>My permissions</h1><p>Read-only overview of permissions granted by yourshop owner.</p></div>
              <section className="employee-panel"><div className="employee-panel-head"><h2>Granted permissions</h2><span className="employee-count-label">{granted.size} permission{granted.size === 1 ? "" : "s"}</span></div>
                {granted.size ? <div className="employee-permissions-list">{[...granted].sort().map((permission) => <div className="employee-permission-line" key={permission}><span className="employee-check">✓</span><span>{permission}</span><span className="employee-granted-tag">Granted</span></div>)}</div> : <p>No permissions assigned. Ask your shop owner to grant access.</p>}
              </section></>
          ) : activePage === "module" ? (() =>{
            const module = accessibleModules.find((m) => m.key === selectedModule);
            if (!module) return <section className="employee-panel"><h2>Access unavailable</h2><p>This module is not currently assigned to you.</p><button className="employee-secondary-btn" type="button" onClick={() => navigate("overview")}>Back to overview</button></section>;
            return <><div className="employee-page-heading"><span className="employee-eyebrow">ASSIGNED MODULE</span><h1>{module.title}</h1><p>{module.description}</p></div>
              {module.key === "orders" ? (
                <EmployeeOrders canManage={granted.has("orders.manage")} />
              ) : module.key === "products" || module.key === "inventory" ? (
                <EmployeeCatalog key={module.key} mode={module.key} canManage={Boolean(module.manage && granted.has(module.manage))} />
              ) : module.key === "payments" || module.key === "reports" ? (
                <EmployeeFinance key={module.key} mode={module.key} />
              ) : module.key === "customers" || module.key === "delivery" ? (
                <EmployeeOperations key={module.key} mode={module.key} />
              ) : (
              <section className="employee-panel employee-module-detail"><div className="employee-module-bigicon">{module.icon}</div><h2>{module.title} access granted</h2><p>Your shop owner has granted you {module.manage && granted.has(module.manage) ? "view and manage" : "view"} permission for this module.</p><div className="employee-notice"><strong>Module integration pending</strong><p>Live {module.title.toLowerCase()} data is not available here yet. This screen does not bypass the Shop Owner APIs. The backend needs a permission-protected employee endpoint before you can work with live data.</p></div><button className="employee-secondary-btn" type="button" onClick={() => navigate("overview")}>Back to dashboard</button></section>
              )}
            </>;
          })() : (
            <><div className="employee-welcome"><div><span className="employee-eyebrow">EMPLOYEE WORKSPACE</span><h1>Good to see you, {firstName} <span className="employee-wave">✦</span></h1><p>Here’s your workspace and the modules your shop owner has approved for you.</p><span className="employee-role-tag">{roleName}</span></div><div className="employee-welcome-art" aria-hidden="true"><span>▦</span><span>◈</span><span>▤</span></div></div>
              <div className="employee-stats"><div className="employee-stat"><span>Available modules</span><strong>{accessibleModules.length}</strong><small>Assigned to your account</small></div><div className="employee-stat"><span>Total permissions</span><strong>{granted.size}</strong><small>Set by your shop owner</small></div><div className="employee-stat"><span>Manage capabilities</span><strong>{manageCount}</strong><small>Modules with manage access</small></div></div>
              <section className="employee-panel employee-modules-section"><div className="employee-panel-head"><div><h2>My modules</h2><p>Open a module to see your assigned access.</p></div><button type="button" className="employee-text-btn" onClick={() => navigate("access")}>View all permissions →</button></div>
                {accessibleModules.length ? <div className="employee-module-grid">{accessibleModules.map((module) => <button type="button" key={module.key} className="employee-module-card" onClick={() => { setSelectedModule(module.key); setActivePage("module"); }}><span className="employee-module-icon">{module.icon}</span><strong>{module.title}</strong><span>{module.description}</span><small>{module.manage && granted.has(module.manage) ? "View & manage" : "View access"}<b>→</b></small></button>)}</div> : <div className="employee-empty-state"><h3>No modules assigned yet</h3><p>Contact your shop owner to request access to your work modules.</p></div>}
              </section>
              <div className="employee-info-strip"><span className="employee-info-icon">i</span><div><strong>Access is controlled by your shop owner</strong><p>Modules shown here reflect your permissions. Actual order, product, inventory and other live operations will become available after their secured employee APIs are connected.</p></div><button type="button" onClick={loadProfile} className="employee-secondary-btn"disabled={loading}>Refresh access</button></div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
