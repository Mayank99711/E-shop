import { randomBytes, timingSafeEqual } from "node:crypto";

export function issueCsrfToken(request, response) {
  if (!request.session.csrfToken) {
    request.session.csrfToken = randomBytes(32).toString("hex");
  }
  response.set("Cache-Control", "no-store");
  response.json({ csrfToken: request.session.csrfToken });
}

export function requireCsrf(request, response, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    next();
    return;
  }

  const supplied = request.get("x-csrf-token");
  const expected = request.session?.csrfToken;
  if (typeof supplied !== "string" || typeof expected !== "string") {
    response.status(403).json({ error: { code: "CSRF_TOKEN_REQUIRED", message: "Refresh the page and try again." } });
    return;
  }

  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    response.status(403).json({ error: { code: "CSRF_TOKEN_INVALID", message: "Refresh the page and try again." } });
    return;
  }

  next();
}
