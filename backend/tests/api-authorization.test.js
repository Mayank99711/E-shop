import test from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET ??= "api-test-session-secret-with-more-than-32-characters";

const [{ default: app }, { prisma, sessionPool }, { default: adminRouter }, { default: customerRouter }, { default: ownerRouter }] = await Promise.all([
  import("../src/app.js"),
  import("../src/config/database.js"),
  import("../src/routes/admin.js"),
  import("../src/routes/customer.js"),
  import("../src/routes/owner.js")
]);

test("admin edit routes are registered when the router is created", () => {
  const patchRoutes = adminRouter.stack
    .filter(({ route }) => route?.methods?.patch)
    .map(({ route }) => route.path);

  assert.ok(patchRoutes.includes("/categories/:categoryId"));
  assert.ok(patchRoutes.includes("/brands/:brandId"));
  assert.ok(patchRoutes.includes("/variant-attributes/:attributeId"));
  assert.ok(patchRoutes.includes("/variant-attributes/:attributeId/values/:valueId"));
  assert.ok(patchRoutes.includes("/products/:productId/status"));
  for (const routePath of ["/employees", "/commissions", "/orders", "/products", "/audit-logs"]) {
    assert.ok(adminRouter.stack.some(({ route }) => route?.path === routePath && route.methods.get), `Expected GET ${routePath}`);
  }
  assert.ok(adminRouter.stack.some(({ route }) => route?.path === "/orders/:orderId/razorpay/reconcile" && route.methods.post));
  assert.ok(adminRouter.stack.some(({ route }) => route?.path === "/account-deletion-requests" && route.methods.get));
  assert.ok(adminRouter.stack.some(({ route }) => route?.path === "/account-deletion-requests/:requestId" && route.methods.patch));

  const customerRoutes = customerRouter.stack.filter(({ route }) => route).map(({ route }) => route);
  assert.ok(customerRoutes.some((route) => route.path === "/account-deletion-request" && route.methods.get));
  assert.ok(customerRoutes.some((route) => route.path === "/account-deletion-request" && route.methods.post));
  assert.ok(customerRoutes.some((route) => route.path === "/account-deletion-request" && route.methods.delete));

  const ownerRoutes = ownerRouter.stack.filter(({ route }) => route).map(({ route }) => route);
  assert.ok(ownerRoutes.some((route) => route.path === "/shop" && route.methods.get));
  assert.ok(ownerRoutes.some((route) => route.path === "/shop" && route.methods.patch));
  assert.ok(ownerRoutes.some((route) => route.path === "/products/:productId/images" && route.methods.post));
  assert.ok(ownerRoutes.some((route) => route.path === "/products/:productId/images/:imageId" && route.methods.delete));
});

test("HTTP API rejects unauthenticated access to protected routes", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const responses = await Promise.all([
      fetch(`${baseUrl}/api/auth/me`),
      fetch(`${baseUrl}/api/admin/dashboard`),
      fetch(`${baseUrl}/api/owner/dashboard`),
      fetch(`${baseUrl}/api/owner/shop`),
      fetch(`${baseUrl}/api/owner/products`),
      fetch(`${baseUrl}/api/customer/favourites`),
      fetch(`${baseUrl}/api/customer/cart`),
      fetch(`${baseUrl}/api/customer/addresses`),
      fetch(`${baseUrl}/api/customer/orders`),
      fetch(`${baseUrl}/api/customer/account-deletion-request`),
      fetch(`${baseUrl}/api/admin/account-deletion-requests`),
      fetch(`${baseUrl}/api/admin/employees`),
      fetch(`${baseUrl}/api/admin/commissions`),
      fetch(`${baseUrl}/api/admin/orders`),
      fetch(`${baseUrl}/api/admin/products`),
      fetch(`${baseUrl}/api/admin/audit-logs`),
      fetch(`${baseUrl}/api/admin/orders/89048175-2eae-4c39-adb4-ba0019896ad9/razorpay/reconcile`, { method: "POST" })
    ]);

    assert.deepEqual(
      responses.map(({ status }) => status),
      [...Array(16).fill(401), 403]
    );
    const payloads = await Promise.all(responses.map((response) => response.json()));
    assert.ok(payloads.slice(0, 16).every(({ error }) => error?.code === "AUTHENTICATION_REQUIRED"));
    assert.equal(payloads[16].error.code, "CSRF_TOKEN_REQUIRED");

    const invalidCatalogQuery = await fetch(`${baseUrl}/api/catalog/products?sort=unknown`);
    assert.equal(invalidCatalogQuery.status, 400);
    assert.equal((await invalidCatalogQuery.json()).error.code, "VALIDATION_ERROR");

    const unsafe = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
    assert.equal(unsafe.status, 403);
    assert.equal((await unsafe.json()).error.code, "CSRF_TOKEN_REQUIRED");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await Promise.all([prisma.$disconnect(), sessionPool.end()]);
  }
});
