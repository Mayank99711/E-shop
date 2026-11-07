import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

export default function PortalLayout({ title, user, navigation, onLogout, children, bottomNavigation = [] }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem("portalSidebarCollapsed") === "true"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("portalSidebarCollapsed", String(sidebarCollapsed)); } catch {} }, [sidebarCollapsed]);

  const isMobile = () => window.innerWidth < 900;
  const toggleSidebar = () => isMobile() ? setSidebarOpen((o) => !o) : setSidebarCollapsed((c) => !c);
  const closeSidebar = () => setSidebarOpen(false);
  const sidebarExpanded = isMobile() ? sidebarOpen : !sidebarCollapsed;

  const renderNav = (nav) => (nav || []).filter((item) => item.label !== "Settings").map((item, i) => {
    if (item.children) {
      const isActiveGroup = item.children.some((child) => location.pathname === child.to || location.pathname.startsWith(`${child.to}/`));
      const expanded = expandedGroups[item.label] ?? isActiveGroup;
      return (
        <div key={i} className="sidebar-group">
          <button
  type="button"
  className="sidebar-link sidebar-group-toggle"
  title={item.label}
  aria-expanded={expanded}
  onClick={() =>
    setExpandedGroups((previous) => ({
      ...previous,
      [item.label]: !expanded,
    }))
  }
>
  <span className="sidebar-link-label">
    {item.label} {expanded ? "▾" : "▸"}
  </span>
</button>
          {expanded && item.children.filter((c) => c.label !== "Settings").map((c, j) => (
            <NavLink key={j} to={c.to} className="sidebar-link" title={c.label} onClick={closeSidebar}>
              <span className="sidebar-link-label">{c.label}</span>
            </NavLink>
          ))}
        </div>
      );
    }
    return (
      <NavLink key={i} to={item.to} className="sidebar-link" title={item.label} onClick={closeSidebar}>
        <span className="sidebar-link-label">{item.label}</span>
      </NavLink>
    );
  });

  return (
    <div className={`portal-layout ${sidebarOpen ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <button className="sidebar-scrim" type="button" aria-label="Close" onClick={closeSidebar} />
      <aside className="portal-sidebar">
        <NavLink className="sidebar-brand" to={navigation?.find((item) => item.to)?.to || "/"} onClick={closeSidebar} title="E-Shop">
          <span className="brand-mark">E</span><span className="sidebar-link-label">E-Shop</span>
        </NavLink>
        <span className="sidebar-caption">{title}</span>
        <nav>
          {renderNav(navigation)}
        </nav>
        <div className="sidebar-bottom">
          {bottomNavigation.map((b) => b.label !== "Settings" && (
            <NavLink key={b.to} to={b.to} className="sidebar-link" title={b.label} onClick={closeSidebar}>
              <span className="sidebar-link-label">{b.label}</span>
            </NavLink>
          ))}
          <NavLink to="/" className="sidebar-link back-to-site-link" onClick={closeSidebar} title="Back to Site">
            <span>←</span><span className="sidebar-link-label">Back to Site</span>
          </NavLink>
        </div>
      </aside>
      <div className="portal-content">
        <header className="portal-topbar">
          <button className="sidebar-toggle btn btn-outline-secondary" aria-label={sidebarExpanded ? "Collapse" : "Expand"} aria-expanded={sidebarExpanded} onClick={toggleSidebar}>☰</button>
          <h1>{title}</h1>
          <div className="topbar-actions">
            <span className="topbar-identity"><strong className="topbar-user">{user?.name || user?.firstName || "Account"}</strong><small className="topbar-email">{user?.email || ""}</small></span>
            {user?.role && <span className="topbar-role ms-2">{user.role === "SUPER_ADMIN" ? "Super Admin" : user.role === "SHOP_OWNER" ? "Shop Owner" : user.role}</span>}
            <button type="button" className="btn btn-sm btn-outline-secondary ms-2" onClick={onLogout} aria-label="Sign out">
              Sign Out
            </button>
          </div>
        </header>
        <main className="portal-main">{children}</main>
      </div>
    </div>
  );
}
