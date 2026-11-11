import { Route, Routes } from "react-router-dom";
import ShopOwnerPortal from "../pages/shopOwner/ShopOwnerPortal.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import UnifiedLogin from "../pages/auth/UnifiedLogin.jsx";
import PortalTabGate from "./PortalTabGate.jsx";
export default function ShopOwnerRoutes() {
  return <Routes>
    <Route
  path="login"
  element={
    <PortalTabGate portal="shop-owner">
      <UnifiedLogin initialPortal="shop-owner" />
    </PortalTabGate>
  }
/>
    <Route path="activate-account" element={<ShopOwnerPortal />} />
    <Route path="activate-employee" element={<ShopOwnerPortal />} />
    <Route path="reset-password" element={<ShopOwnerPortal />} />
    <Route element={<ProtectedRoute role={["SHOP_OWNER", "SHOP_EMPLOYEE"]} />}>
      <Route path="*" element={<ShopOwnerPortal />} />
    </Route>
  </Routes>;
}
