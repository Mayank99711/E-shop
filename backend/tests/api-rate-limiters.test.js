import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { createApiRateLimiters, createLoginRateLimiter } from "../src/middleware/api-rate-limiters.js";

test("catalog traffic has an independent API budget and login remains strictly rate limited", async () => {
  const { apiLimiter, authApiLimiter } = createApiRateLimiters({
    windowMs: 120,
    apiLimit: 2,
    authLimit: 20
  });
  const loginLimiter = createLoginRateLimiter({ windowMs: 120, limit: 2 });
  const app = express();
  let catalogHandlerCount = 0;
  let loginHandlerCount = 0;

  app.use("/api", apiLimiter);
  app.use("/api/auth", authApiLimiter);
  app.get("/api/catalog/products", (_request, response) => {
    catalogHandlerCount += 1;
    response.json({ items: [] });
  });
  app.get("/api/auth/csrf", (_request, response) => response.json({ csrfToken: "test-token" }));
  app.post("/api/auth/login", loginLimiter, (_request, response) => {
    loginHandlerCount += 1;
    response.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials." } });
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const catalogResponses = [];
    for (let index = 0; index < 3; index += 1) {
      catalogResponses.push(await fetch(`${baseUrl}/api/catalog/products`));
    }
    assert.deepEqual(catalogResponses.map(({ status }) => status), [200, 200, 429]);
    assert.equal(catalogHandlerCount, 2);
    assert.ok(Number(catalogResponses[2].headers.get("retry-after")) > 0);

    assert.equal((await fetch(`${baseUrl}/api/auth/csrf`)).status, 200);
    const firstLogin = await fetch(`${baseUrl}/api/auth/login`, { method: "POST" });
    const secondLogin = await fetch(`${baseUrl}/api/auth/login`, { method: "POST" });
    const blockedLogin = await fetch(`${baseUrl}/api/auth/login`, { method: "POST" });
    assert.deepEqual([firstLogin.status, secondLogin.status, blockedLogin.status], [401, 401, 429]);
    assert.equal(loginHandlerCount, 2);
    assert.ok(Number(blockedLogin.headers.get("retry-after")) > 0);
    assert.equal((await blockedLogin.json()).error.code, "TOO_MANY_LOGIN_ATTEMPTS");

    await new Promise((resolve) => setTimeout(resolve, 150));
    const recoveredLogin = await fetch(`${baseUrl}/api/auth/login`, { method: "POST" });
    assert.equal(recoveredLogin.status, 401);
    assert.equal((await recoveredLogin.json()).error.code, "INVALID_CREDENTIALS");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("the production login limiter default blocks after ten attempts without authenticating", async () => {
  const app = express();
  let loginHandlerCount = 0;
  app.post("/api/auth/login", createLoginRateLimiter(), (_request, response) => {
    loginHandlerCount += 1;
    response.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials." } });
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const responses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(await fetch(`${baseUrl}/api/auth/login`, { method: "POST" }));
    }

    assert.deepEqual(responses.slice(0, 10).map(({ status }) => status), Array(10).fill(401));
    assert.equal(responses[10].status, 429);
    assert.equal(loginHandlerCount, 10);
    assert.ok(Number(responses[10].headers.get("retry-after")) > 0);
    assert.equal((await responses[10].json()).error.code, "TOO_MANY_LOGIN_ATTEMPTS");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
