
import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  useCustomerAuth,
  CustomerAuth,
} from "./CustomerAuth.jsx";

import {
  usePortalAuth as useOwnerAuth,
  PortalAuth as OwnerPortalAuth,
} from "./OwnerAuth.jsx";

import {
  usePortalAuth as useAdminAuth,
  PortalAuth as AdminPortalAuth,
} from "./AdminAuth.jsx";

import { getTabPortalLock } from "../../utils/portalTabLock.js";

const portalNames = {
  customer: "Customer",
  "shop-owner": "Shop Owner",
  "super-admin": "Super Admin",
};

const portalHomePaths = {
  customer: "/",
  "shop-owner": "/shop/dashboard",
  "super-admin": "/admin/dashboard",
};

export default function UnifiedLogin({ initialPortal }) {
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);

  const portal = initialPortal || params.get("portal") || "customer";

  const activePortal = getTabPortalLock();

  const isBlocked =
    Boolean(activePortal) && activePortal !== portal;

  const customerAuth = useCustomerAuth();
  const ownerAuth = useOwnerAuth("SHOP_OWNER");
  const adminAuth = useAdminAuth("SUPER_ADMIN");

  // Redirect only when the requested portal is allowed in this tab.
  useEffect(() => {
    if (isBlocked) return;

    if (portal === "customer" && customerAuth.user) {
      navigate("/", { replace: true });
    } else if (portal === "shop-owner" && ownerAuth.user) {
      navigate("/shop/dashboard", { replace: true });
    } else if (portal === "super-admin" && adminAuth.user) {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [
    portal,
    isBlocked,
    customerAuth.user,
    ownerAuth.user,
    adminAuth.user,
    navigate,
  ]);

  // Do not open the sign-in dialog for another portal.
  useEffect(() => {
    if (isBlocked) return;

    if (portal === "customer") {
      customerAuth.open("login");
    } else if (portal === "shop-owner") {
      ownerAuth.setDialogOpen(true);
    } else if (portal === "super-admin") {
      adminAuth.setDialogOpen(true);
    }
  }, [portal, isBlocked]);

  if (isBlocked) {
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
              You are currently signed in to the{" "}
              <strong>{portalNames[activePortal]}</strong>{" "}
              portal in this tab.
            </p>

            <p>
              Please sign out from your current portal before
              opening the {portalNames[portal]} login page.
            </p>

            <Link
              to={portalHomePaths[activePortal]}
              className="btn btn-primary"
            >
              Back to {portalNames[activePortal]}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      {portal === "customer" && (
        <CustomerAuth auth={customerAuth} />
      )}

      {portal === "shop-owner" && (
        <OwnerPortalAuth auth={ownerAuth} />
      )}

      {portal === "super-admin" && (
        <AdminPortalAuth auth={adminAuth} />
      )}
    </>
  );
}
