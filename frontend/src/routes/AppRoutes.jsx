import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Loader from "../components/common/Loader.jsx";

const AdminRoutes = lazy(() => import("./AdminRoutes.jsx"));
const ShopOwnerRoutes = lazy(() => import("./ShopOwnerRoutes.jsx"));
const CustomerRoutes = lazy(() => import("./CustomerRoutes.jsx"));

const UnifiedLogin = lazy(() => import("../pages/auth/UnifiedLogin.jsx"));
const ShopOwnerPortal = lazy(() => import("../pages/shopOwner/ShopOwnerPortal.jsx"));

export default function AppRoutes() {
  return <Suspense fallback={<Loader />}><Routes>
      <Route path="/login" element={<UnifiedLogin />} />
      <Route path="/activate-employee" element={<ShopOwnerPortal />} />
      <Route path="/admin/*" element={<AdminRoutes />} />
      <Route path="/shop/*" element={<ShopOwnerRoutes />} />
      <Route path="*" element={<CustomerRoutes />} />
    </Routes></Suspense>;
}
