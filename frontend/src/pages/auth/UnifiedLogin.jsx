import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCustomerAuth, CustomerAuth } from "./CustomerAuth.jsx";
import { usePortalAuth as useOwnerAuth, PortalAuth as OwnerPortalAuth } from "./OwnerAuth.jsx";
import { usePortalAuth as useAdminAuth, PortalAuth as AdminPortalAuth } from "./AdminAuth.jsx";

export default function UnifiedLogin({ initialPortal }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const portal = initialPortal || params.get("portal") || "customer";

  const customerAuth = useCustomerAuth();
  const ownerAuth = useOwnerAuth("SHOP_OWNER");
  const adminAuth = useAdminAuth("SUPER_ADMIN");

  useEffect(() => {
    if (portal === "customer" && customerAuth.user) {
      navigate("/", { replace: true });
    } else if (portal === "shop-owner" && ownerAuth.user) {
      navigate("/shop/dashboard", { replace: true });
    } else if (portal === "super-admin" && adminAuth.user) {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [portal, customerAuth.user, ownerAuth.user, adminAuth.user, navigate]);

  useEffect(() => {
    if (portal === "customer") {
      customerAuth.open("login");
    } else if (portal === "shop-owner") {
      ownerAuth.setDialogOpen(true);
    } else {
      adminAuth.setDialogOpen(true);
    }
  }, [portal]);

  return (
    <>
      {portal === "customer" && <CustomerAuth auth={customerAuth} />}
      {portal === "shop-owner" && <OwnerPortalAuth auth={ownerAuth} />}
      {portal === "super-admin" && <AdminPortalAuth auth={adminAuth} />}
    </>
  );
}
