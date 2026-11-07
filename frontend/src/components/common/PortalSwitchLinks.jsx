import { Link } from "react-router-dom";

const PORTALS = [
  { key: "customer", label: "Customer", to: "/login?portal=customer" },
  { key: "shop-owner", label: "Shop Owner", to: "/login?portal=shop-owner" },
  { key: "super-admin", label: "Super Admin", to: "/login?portal=super-admin" }
];

export default function PortalSwitchLinks({ current }) {
  return (
    <nav className="portal-switch-links" aria-label="Portal selection" style={{ display: "flex", gap: "6px", justifyContent: "center", marginBottom: "12px", fontSize: "12px" }}>
      {PORTALS.map((portal, index) => (
        <span key={portal.key} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          {index > 0 && <span style={{ color: "#9aa6bd" }}>|</span>}
          <Link
            to={portal.to}
            style={{
              color: current === portal.key ? "#142541" : "#3569dc",
              fontWeight: current === portal.key ? 700 : 500,
              textDecoration: "none"
            }}
          >
            {portal.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
