import test from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET ??= "test-session-secret-with-more-than-32-characters";

const { issueCsrfToken, requireCsrf } = await import("../src/middleware/csrf.js");
const { requireAuth, requireRole } = await import("../src/middleware/require-auth.js");

test("CSRF endpoint creates a session-bound token without caching it", () => {
  const request = { session: {} };
  const headers = {};
  let result;
  const response = {
    set(name, value) { headers[name] = value; return this; },
    json(body) { result = body; }
  };

  issueCsrfToken(request, response);

  assert.match(result.csrfToken, /^[a-f0-9]{64}$/);
  assert.equal(request.session.csrfToken, result.csrfToken);
  assert.equal(headers["Cache-Control"], "no-store");
});

test("CSRF middleware rejects unsafe requests without a matching token", () => {
  let nextCalled = false;
  let statusCode;
  let body;
  const response = {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; }
  };

  requireCsrf(
    { method: "POST", session: { csrfToken: "a".repeat(64) }, get: () => "b".repeat(64) },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.equal(body.error.code, "CSRF_TOKEN_INVALID");
});

test("CSRF middleware accepts a matching token and safe methods", () => {
  const token = "c".repeat(64);
  let nextCalls = 0;
  const next = () => { nextCalls += 1; };
  const response = { status() { return this; }, json() {} };

  requireCsrf({ method: "POST", session: { csrfToken: token }, get: () => token }, response, next);
  requireCsrf({ method: "GET", session: undefined, get: () => undefined }, response, next);

  assert.equal(nextCalls, 2);
});

test("authentication middleware enforces a session and role", () => {
  let statusCode;
  let error;
  let nextCalls = 0;
  const response = {
    status(code) { statusCode = code; return this; },
    json(body) { error = body.error; }
  };
  const next = () => { nextCalls += 1; };

  requireAuth({ session: {} }, response, next);
  assert.equal(statusCode, 401);
  assert.equal(error.code, "AUTHENTICATION_REQUIRED");

  requireRole("SUPER_ADMIN")({ authUser: { role: "CUSTOMER" } }, response, next);
  assert.equal(statusCode, 403);
  assert.equal(error.code, "FORBIDDEN");

  requireRole("SUPER_ADMIN")({ authUser: { role: "SUPER_ADMIN" } }, response, next);
  assert.equal(nextCalls, 1);
});
