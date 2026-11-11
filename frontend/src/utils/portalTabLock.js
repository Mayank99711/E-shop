const STORAGE_KEY = "eshop.activeBrowserPortal";

const VALID_PORTALS = ["customer", "shop-owner", "super-admin"];

export function portalForRole(role) {
  if (role === "SUPER_ADMIN") {
    return "super-admin";
  }

  if (role === "SHOP_OWNER" || role === "SHOP_EMPLOYEE") {
    return "shop-owner";
  }

  if (role === "CUSTOMER") {
    return "customer";
  }

  return null;
}

export function portalForPath(pathname) {
  if (pathname.startsWith("/admin")) {
    return "super-admin";
  }

  if (pathname.startsWith("/shop")) {
    return "shop-owner";
  }

  return "customer";
}

// Shared across all tabs and normal windows
// belonging to the same browser profile.
export function getTabPortalLock() {
  const value = localStorage.getItem(STORAGE_KEY);

  return VALID_PORTALS.includes(value) ? value : null;
}

export function lockTabToPortal(portal) {
  if (!VALID_PORTALS.includes(portal)) {
    throw new Error("Invalid E-Shop portal.");
  }

  const activePortal = getTabPortalLock();

  if (activePortal && activePortal !== portal) {
    throw new Error(
      "Another E-Shop portal is already signed in. " +
        "Please sign out from that portal first.",
    );
  }

  localStorage.setItem(STORAGE_KEY, portal);
}

export function clearTabPortalLock() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isPortalBlocked(portal) {
  const activePortal = getTabPortalLock();

  return Boolean(activePortal && activePortal !== portal);
}

export function subscribeToPortalLock(callback) {
  const handleStorage = (event) => {
    if (event.key === STORAGE_KEY) {
      callback(getTabPortalLock());
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("storage", handleStorage);
  };
}
