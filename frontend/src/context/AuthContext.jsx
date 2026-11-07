import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authService } from "../services/authService.js";
import { resetInFlightRequests } from "../services/apiClient.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshPromise = useRef(null);
  const sessionMutationVersion = useRef(0);
  const userIdentity = user ? `${user.id}:${user.role}` : "anonymous";
  const previousIdentity = useRef(userIdentity);

  const refresh = useCallback(async () => {
    if (refreshPromise.current) return refreshPromise.current;
    const requestVersion = sessionMutationVersion.current;

// Only show the blocking loader when no authenticated user is available.
// A background focus/session refresh should keep the portal mounted.
if (!previousIdentity.current || previousIdentity.current === "anonymous") {
  setLoading(true);
}

const request = authService.restoreSession().then(({ user: currentUser }) => {
      if (requestVersion === sessionMutationVersion.current) setUser(currentUser);
      return currentUser;
    }).catch((error) => {
      if (error.status === 401 && requestVersion === sessionMutationVersion.current) {
        setUser(null);
        return null;
      }
      throw error;
    }).finally(() => {
      setLoading(false);
      refreshPromise.current = null;
    });
    refreshPromise.current = request;
    return request;
  }, []);

  useEffect(() => {
    refresh().catch((error) => console.error("Could not restore the E-Shop session.", error));
  }, [refresh]);

  useEffect(() => {
    let sessionCheckTimer;
    const checkSession = () => {
      if (
        document.visibilityState === "hidden" ||
        refreshPromise.current ||
        sessionCheckTimer
      ) return;
      sessionCheckTimer = window.setTimeout(() => {
        sessionCheckTimer = null;
        if (document.visibilityState === "hidden" || refreshPromise.current) return;
        refresh().catch((error) => console.error("Could not refresh the E-Shop session.", error));
      }, 100);
    };
    const handleInvalidSession = (event) => {
      const expectedPortal =
  user?.role === "SUPER_ADMIN"
    ? "super-admin"
    : user?.role === "SHOP_OWNER" ||
        user?.role === "SHOP_EMPLOYEE"
      ? "shop-owner"
      : "customer";
      if (event.detail?.portal === expectedPortal) checkSession();
    };
    window.addEventListener("focus", checkSession);
    window.addEventListener("pageshow", checkSession);
    window.addEventListener("eshop:session-invalid", handleInvalidSession);
    document.addEventListener("visibilitychange", checkSession);
    return () => {
      window.clearTimeout(sessionCheckTimer);
      window.removeEventListener("focus", checkSession);
      window.removeEventListener("pageshow", checkSession);
      window.removeEventListener("eshop:session-invalid", handleInvalidSession);
      document.removeEventListener("visibilitychange", checkSession);
    };
  }, [refresh, user?.role]);

  useEffect(() => {
    if (previousIdentity.current !== userIdentity) {
      resetInFlightRequests();
      previousIdentity.current = userIdentity;
    }
  }, [userIdentity]);

  const login = useCallback(async (role, email, password, rememberMe = false) => {
    const result = await authService.login({ role, email, password, rememberMe });
    sessionMutationVersion.current += 1;
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    sessionMutationVersion.current += 1;
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);
  return <AuthContext.Provider key={userIdentity} value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
