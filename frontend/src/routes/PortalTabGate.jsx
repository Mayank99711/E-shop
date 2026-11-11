
import { Link } from "react-router-dom";
import { getTabPortalLock } from "../utils/portalTabLock.js";

const portalNames = {
  "customer": "Customer",
  "shop-owner": "Shop Owner",
  "super-admin": "Super Admin",
};

const portalHomes = {
  "customer": "/",
  "shop-owner": "/shop",
  "super-admin": "/admin/dashboard",
};

export default function PortalTabGate({ portal, children }) {
  const activePortal = getTabPortalLock();

  if (!activePortal || activePortal === portal) {
    return children;
  }

  return (
    <main className="container py-5">
      <section
        className="card shadow-sm mx-auto"
        style={{ maxWidth: 520 }}
        role="alert"
      >
        <div className="card-body p-4 text-center">
          <h1 className="h4 mb-3">
            Another portal is already active
          </h1>

          <p className="text-muted">
            You are signed in to the{" "}
            <strong>{portalNames[activePortal]}</strong> portal
            in this tab.
          </p>

          <p>
            Please sign out from your current portal before
            opening {portalNames[portal]} here.
          </p>

          <Link
            to={portalHomes[activePortal]}
            className="btn btn-primary"
          >
            Back to {portalNames[activePortal]}
          </Link>
        </div>
      </section>
    </main>
  );
}
