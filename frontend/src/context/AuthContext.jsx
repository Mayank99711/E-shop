
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { authService } from "../services/authService.js";
import { resetInFlightRequests } from "../services/apiClient.js";

import {
  portalForRole,
  portalForPath,
  getTabPortalLock,
  lockTabToPortal,
  clearTabPortalLock,
  subscribeToPortalLock,
} from "../utils/portalTabLock.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Shared across tabs in the same browser profile.
  const [activePortal, setActivePortal] = useState(
    () => getTabPortalLock()
  );

  const refreshPromise = useRef(null);
  const sessionMutationVersion = useRef(0);

  const userRef = useRef(null);

  const userIdentity = user
    ? `${user.id}:${user.role}`
    : "anonymous";

  const previousIdentity = useRef(userIdentity);

  // Keep the current user reference synchronized.
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refresh = useCallback(async () => {
    const lockedPortal = getTabPortalLock();
    const requestedPortal = portalForPath(
      window.location.pathname
    );

    // Never restore another portal's session while
    // this browser profile is locked to a different portal.
    if (
      lockedPortal &&
      lockedPortal !== requestedPortal
    ) {
      sessionMutationVersion.current += 1;
      setUser(null);
      setLoading(false);
      return null;
    }

    if (refreshPromise.current) {
      return refreshPromise.current;
    }

    const requestVersion = sessionMutationVersion.current;

    if (!userRef.current) {
      setLoading(true);
    }

    const request = authService
      .restoreSession()
      .then(({ user: currentUser }) => {
        if (
          requestVersion !== sessionMutationVersion.current
        ) {
          return null;
        }

        const restoredPortal = portalForRole(
          currentUser?.role
        );

        const latestLock = getTabPortalLock();

        // Another tab may have changed the active portal
        // while session restoration was in progress.
        if (
          restoredPortal &&
          latestLock &&
          restoredPortal !== latestLock
        ) {
          setUser(null);
          return null;
        }

        if (restoredPortal) {
          lockTabToPortal(restoredPortal);
          setActivePortal(restoredPortal);
        }

        setUser(currentUser || null);

        return currentUser || null;
      })
      .catch((error) => {
        if (
          error.status === 401 &&
          requestVersion === sessionMutationVersion.current
        ) {
          setUser(null);

          // Do not clear a shared browser lock here.
          // Another tab may own the active session.
          return null;
        }

        throw error;
      })
      .finally(() => {
        setLoading(false);
        refreshPromise.current = null;
      });

    refreshPromise.current = request;

    return request;
  }, []);

  // Restore the current portal session when the app starts.
  useEffect(() => {
    refresh().catch((error) => {
      console.error(
        "Could not restore the E-Shop session.",
        error
      );
    });
  }, [refresh]);

  // Detect browser-profile portal changes across tabs.
  useEffect(() => {
    return subscribeToPortalLock((nextPortal) => {
      setActivePortal(nextPortal);

      const currentUserPortal = portalForRole(
        userRef.current?.role
      );

      if (
        nextPortal &&
        currentUserPortal &&
        nextPortal !== currentUserPortal
      ) {
        sessionMutationVersion.current += 1;

        resetInFlightRequests();
        userRef.current = null;
        setUser(null);
      }
    });
  }, []);

  // Refresh sessions on focus and visibility changes.
  useEffect(() => {
    let sessionCheckTimer;

    const checkSession = () => {
      if (
        document.visibilityState === "hidden" ||
        refreshPromise.current ||
        sessionCheckTimer
      ) {
        return;
      }

      sessionCheckTimer = window.setTimeout(() => {
        sessionCheckTimer = null;

        if (
          document.visibilityState === "hidden" ||
          refreshPromise.current
        ) {
          return;
        }

        refresh().catch((error) => {
          console.error(
            "Could not refresh the E-Shop session.",
            error
          );
        });
      }, 100);
    };

    const handleInvalidSession = (event) => {
      const expectedPortal = portalForRole(
        userRef.current?.role
      );

      if (
        expectedPortal &&
        event.detail?.portal === expectedPortal
      ) {
        checkSession();
      }
    };

    window.addEventListener("focus", checkSession);
    window.addEventListener("pageshow", checkSession);

    window.addEventListener(
      "eshop:session-invalid",
      handleInvalidSession
    );

    document.addEventListener(
      "visibilitychange",
      checkSession
    );

    return () => {
      window.clearTimeout(sessionCheckTimer);

      window.removeEventListener("focus", checkSession);
      window.removeEventListener("pageshow", checkSession);

      window.removeEventListener(
        "eshop:session-invalid",
        handleInvalidSession
      );

      document.removeEventListener(
        "visibilitychange",
        checkSession
      );
    };
  }, [refresh]);

  // Reset request deduplication when authenticated identity changes.
  useEffect(() => {
    if (previousIdentity.current !== userIdentity) {
      resetInFlightRequests();
      previousIdentity.current = userIdentity;
    }
  }, [userIdentity]);

  // Login is restricted to the active portal.
  const login = useCallback(
    async (role, email, password, rememberMe = false) => {
      const requestedPortal = portalForRole(role);

      if (!requestedPortal) {
        throw new Error("Invalid E-Shop account role.");
      }

      const lockedPortal = getTabPortalLock();

      if (
        lockedPortal &&
        lockedPortal !== requestedPortal
      ) {
        throw new Error(
          "Another E-Shop portal is already active in this browser. " +
          "Please sign out from that portal first."
        );
      }

      const result = await authService.login({
        role,
        email,
        password,
        rememberMe,
      });

      // Recheck after the async login request.
      const latestLock = getTabPortalLock();

      if (
        latestLock &&
        latestLock !== requestedPortal
      ) {
        throw new Error(
          "Another portal became active during sign in. " +
          "Please return to the active portal."
        );
      }

      sessionMutationVersion.current += 1;

      lockTabToPortal(requestedPortal);

      setActivePortal(requestedPortal);
      userRef.current = result.user;
      setUser(result.user);

      return result.user;
    },
    []
  );

  // Release the browser lock after successful logout.
  const logout = useCallback(async () => {
    const currentPortal = portalForRole(
      userRef.current?.role
    );

    await authService.logout();

    sessionMutationVersion.current += 1;

    // Do not remove a lock owned by another portal.
    if (
      currentPortal &&
      getTabPortalLock() === currentPortal
    ) {
      clearTabPortalLock();
    }

    setActivePortal(getTabPortalLock());

    userRef.current = null;
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refresh,
      activePortal,
    }),
    [user, loading, login, logout, refresh, activePortal]
  );

  return (
    <AuthContext.Provider key={userIdentity} value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within AuthProvider."
    );
  }

  return context;
}
