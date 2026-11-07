import assert from "node:assert/strict";
import express from "express";
import session from "express-session";
import test from "node:test";
import { createPortalSessionMiddleware } from "../src/middleware/portal-session.js";

test("portal sessions remain independent when requests share a browser cookie jar", async (t) => {
  const app = express();
  const store = new session.MemoryStore();
  app.use(createPortalSessionMiddleware(session, {
    store,
    secret: "test-session-secret-that-is-long-enough",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" }
  }));
  app.get("/session/:userId", (request, response) => {
    request.session.userId = request.params.userId;
    response.json({ userId: request.session.userId });
  });
  app.get("/session", (request, response) => {
    response.json({ userId: request.session.userId || null });
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const cookies = new Map();
  async function request(portal, path) {
    const cookieHeader = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      headers: { "x-eshop-portal": portal, ...(cookieHeader ? { cookie: cookieHeader } : {}) }
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const separator = pair.indexOf("=");
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }

  for (const [portal, userId] of [
    ["customer", "customer-user"],
    ["shop-owner", "owner-user"],
    ["super-admin", "admin-user"]
  ]) {
    const response = await request(portal, `/session/${userId}`);
    assert.equal(response.status, 200);
  }

  assert.deepEqual([...cookies.keys()].sort(), [
    "eshop.admin.sid",
    "eshop.customer.sid",
    "eshop.owner.sid"
  ]);
  for (const [portal, userId] of [
    ["customer", "customer-user"],
    ["shop-owner", "owner-user"],
    ["super-admin", "admin-user"]
  ]) {
    const response = await request(portal, "/session");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { userId });
  }
});

test("portal session middleware rejects unknown portal selectors", async (t) => {
  const app = express();
  app.use(createPortalSessionMiddleware(session, {
    store: new session.MemoryStore(),
    secret: "test-session-secret-that-is-long-enough",
    resave: false,
    saveUninitialized: false
  }));
  app.get("/", (_request, response) => response.sendStatus(204));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
    headers: { "x-eshop-portal": "unexpected" }
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: "INVALID_PORTAL", message: "Choose a valid E-Shop portal." }
  });
});
