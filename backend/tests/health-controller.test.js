import assert from "node:assert/strict";
import test from "node:test";

process.env.SESSION_SECRET ??= "health-controller-test-session-secret-long-enough";

const { createHealthCheck } = await import("../src/controllers/health.js");

test("health controller reports a connected database after a successful ping", async () => {
  let payload;
  let forwardedError;
  const handler = createHealthCheck(async () => true);
  await handler({}, { json(value) { payload = value; } }, (error) => { forwardedError = error; });
  assert.deepEqual(payload, { status: "ok", database: "connected" });
  assert.equal(forwardedError, undefined);
});

test("health controller forwards a safe unavailable error when the database ping fails", async () => {
  let forwardedError;
  const handler = createHealthCheck(async () => { throw new Error("private database detail"); });
  await handler({}, { json() { assert.fail("Should not claim database health"); } }, (error) => { forwardedError = error; });
  assert.equal(forwardedError.status, 503);
  assert.equal(forwardedError.code, "DATABASE_UNAVAILABLE");
  assert.equal(forwardedError.message, "The database is unavailable.");
});
