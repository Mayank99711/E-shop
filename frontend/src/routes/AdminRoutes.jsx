import { Route, Routes } from "react-router-dom";
import AdminPortal from "../pages/admin/AdminPortal.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import UnifiedLogin from "../pages/auth/UnifiedLogin.jsx";

export default function AdminRoutes() {
  return <Routes>
    <Route path="login" element={<UnifiedLogin initialPortal="super-admin" />} />
    <Route path="reset-password" element={<AdminPortal />} />
    <Route element={<ProtectedRoute role="SUPER_ADMIN" />}>
      <Route path="*" element={<AdminPortal />} />
    </Route>
  </Routes>;
}
