const portalCookieNames = Object.freeze({
  customer: "eshop.customer.sid",
  "shop-owner": "eshop.owner.sid",
  "super-admin": "eshop.admin.sid"
});

export function createPortalSessionMiddleware(session, options) {
  const middlewareByPortal = new Map(
    Object.entries(portalCookieNames).map(([portal, name]) => [
      portal,
      session({ ...options, name })
    ])
  );

  return (request, response, next) => {
    const requestedPortal = request.get("x-eshop-portal") || "customer";
    const middleware = middlewareByPortal.get(requestedPortal);
    if (!middleware) {
      response.status(400).json({
        error: { code: "INVALID_PORTAL", message: "Choose a valid E-Shop portal." }
      });
      return;
    }

    request.portalSessionCookieName = portalCookieNames[requestedPortal];
    middleware(request, response, next);
  };
}
