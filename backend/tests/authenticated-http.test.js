import assert from "node:assert/strict";
import test from "node:test";

const requiredCredentials = [
  "ADMIN_PASSWORD",
  "TEST_OWNER_PASSWORD",
  "TEST_CUSTOMER_PASSWORD"
];

const missingCredentials = requiredCredentials.filter((name) => !process.env[name]);

let server;
let baseUrl;

if (missingCredentials.length === 0) {
  const { default: app } = await import("../src/app.js");

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  update(response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    const fallback = response.headers.get("set-cookie");
    const list = setCookies.length > 0 ? setCookies : fallback ? [fallback] : [];

    for (const cookie of list) {
      const [pair] = cookie.split(";");
      const separator = pair.indexOf("=");
      if (separator > 0) {
        this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1));
      }
    }
  }

  header() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function request(jar, url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const cookie = jar?.header();
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(url, { ...options, headers });
  jar?.update(response);
  return response;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchCsrfToken(jar, urlBase) {
  const response = await request(jar, `${urlBase}/api/auth/csrf`);
  jar.update(response);
  const body = await readJson(response);
  assert.equal(response.status, 200);
  assert.match(body.csrfToken, /^[a-f0-9]{64}$/);
  return body.csrfToken;
}

async function login(jar, urlBase, email, password, role) {
  const csrfToken = await fetchCsrfToken(jar, urlBase);
  const response = await request(jar, `${urlBase}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify({ email, password, role })
  });

  const body = await readJson(response);
  return { response, body };
}

if (missingCredentials.length > 0) {
  test("authenticated HTTP verification requires seeded credentials", (t) => {
    t.skip(`Missing environment variables: ${missingCredentials.join(", ")}`);
  });
} else {
  test("real HTTP login and /api/auth/me", async () => {
    const jar = new CookieJar();
    const email = "eshop-test-superadmin@example.test";
    const password = process.env.ADMIN_PASSWORD;
    const { response, body } = await login(jar, baseUrl, email, password, "SUPER_ADMIN");

    assert.equal(response.status, 200);
    assert.equal(body.user.role, "SUPER_ADMIN");

    const meResponse = await request(jar, `${baseUrl}/api/auth/me`);
    const meBody = await readJson(meResponse);

    assert.equal(meResponse.status, 200);
    assert.equal(meBody.user.role, "SUPER_ADMIN");
  });

  test("real HTTP role-based access over cookies", async () => {
    const adminJar = new CookieJar();
    const ownerJar = new CookieJar();
    const customerJar = new CookieJar();

    const adminLogin = await login(
      adminJar,
      baseUrl,
      "eshop-test-superadmin@example.test",
      process.env.ADMIN_PASSWORD,
      "SUPER_ADMIN"
    );
    const ownerLogin = await login(
      ownerJar,
      baseUrl,
      "eshop-test-owner@example.test",
      process.env.TEST_OWNER_PASSWORD,
      "SHOP_OWNER"
    );
    const customerLogin = await login(
      customerJar,
      baseUrl,
      "eshop-test-customer@example.test",
      process.env.TEST_CUSTOMER_PASSWORD,
      "CUSTOMER"
    );

    assert.equal(adminLogin.response.status, 200);
    assert.equal(ownerLogin.response.status, 200);
    assert.equal(customerLogin.response.status, 200);

    assert.equal((await request(adminJar, `${baseUrl}/api/admin/dashboard`)).status, 200);
    assert.equal((await request(ownerJar, `${baseUrl}/api/owner/shop`)).status, 200);
    assert.equal((await request(customerJar, `${baseUrl}/api/customer/cart`)).status, 200);

    assert.equal((await request(customerJar, `${baseUrl}/api/admin/dashboard`)).status, 403);
    assert.equal((await request(customerJar, `${baseUrl}/api/owner/shop`)).status, 403);
    assert.equal((await request(ownerJar, `${baseUrl}/api/customer/cart`)).status, 403);
  });

  test("real HTTP unauthenticated and CSRF boundaries", async () => {
    const unauthenticated = await request(new CookieJar(), `${baseUrl}/api/admin/dashboard`);
    assert.equal(unauthenticated.status, 401);

    const jar = new CookieJar();
    const loginResult = await login(
      jar,
      baseUrl,
      "eshop-test-superadmin@example.test",
      process.env.ADMIN_PASSWORD,
      "SUPER_ADMIN"
    );
    assert.equal(loginResult.response.status, 200);

    const missingCsrf = await request(jar, `${baseUrl}/api/auth/logout`, { method: "POST" });
    assert.equal(missingCsrf.status, 403);
    const body = await readJson(missingCsrf);
    assert.equal(body.error.code, "CSRF_TOKEN_REQUIRED");
  });
}
