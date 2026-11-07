import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Loader from "../components/common/Loader.jsx";

export default function ProtectedRoute({ role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loader>Restoring your secure E-Shop session...</Loader>;
  if (!user || !(Array.isArray(role) ? role : [role]).includes(user.role)) {
    const loginPath = role === "SUPER_ADMIN" ? "/admin/login" : role === "SHOP_OWNER" ? "/shop/login" : "/";
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
