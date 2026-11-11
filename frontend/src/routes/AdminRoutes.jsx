import { Route, Routes } from "react-router-dom";
import AdminPortal from "../pages/admin/AdminPortal.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import UnifiedLogin from "../pages/auth/UnifiedLogin.jsx";
import PortalTabGate from "./PortalTabGate.jsx";
export default function AdminRoutes() {
  return <Routes>
    <Route
  path="login"
  element={
    <PortalTabGate portal="super-admin">
      <UnifiedLogin initialPortal="super-admin" />
    </PortalTabGate>
  }
/>
    <Route path="reset-password" element={<AdminPortal />} />
    <Route element={<ProtectedRoute role="SUPER_ADMIN" />}>
      <Route path="*" element={<AdminPortal />} />
    </Route>
  </Routes>;
}
