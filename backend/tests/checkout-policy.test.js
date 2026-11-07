import assert from "node:assert/strict";
import express from "express";
import test from "node:test";

process.env.SESSION_SECRET ??= "checkout-policy-test-session-secret-with-more-than-32-characters";
process.env.TAX_JURISDICTION ??= "Test";
process.env.TAX_RATE ??= "0.10";
process.env.TAX_INCLUSIVE ??= "false";

const [{ default: customerRouter }, { prisma }] = await Promise.all([
  import("../src/routes/customer.js"),
  import("../src/config/database.js")
]);

function customerUser() {
  return {
    id: "e182cb4e-6da2-41e6-a140-14f3a277519b",
    role: "CUSTOMER",
    name: "Test Customer",
    email: "customer@example.test",
    mobile: null,
    profileImageUrl: null,
    isActive: true,
    emailVerifiedAt: new Date(),
    sessionVersion: 0,
    ownedShop: null
  };
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.session = { userId: customerUser().id, role: "CUSTOMER", sessionVersion: 0 };
    next();
  });
  app.use("/api/customer", customerRouter);
  app.use((error, _request, response, _next) => {
    response.status(error.status || 500).json({ error: { code: error.code || "INTERNAL_ERROR", message: error.message, ...(error.details ? { details: error.details } : {}) } });
  });
  return app;
}

test("empty cart is rejected before checkout policy handling", async () => {
  const originalFindUnique = prisma.user.findUnique;
  const originalOrderFindUnique = prisma.order.findUnique;
  const originalAddressFindFirst = prisma.address.findFirst;
  const originalCartFindUnique = prisma.cart.findUnique;
  const originalTransaction = prisma.$transaction;
  prisma.user.findUnique = async () => customerUser();
  prisma.order.findUnique = async () => null;
  prisma.address.findFirst = async () => ({ id: "123e4567-e89b-12d3-a456-426614174000" });
  prisma.cart.findUnique = async () => null;
  prisma.$transaction = async () => { throw new Error("should not be called"); };

  const app = makeApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/customer/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ addressId: "123e4567-e89b-12d3-a456-426614174000", idempotencyKey: "test-key" })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "CART_EMPTY");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    prisma.user.findUnique = originalFindUnique;
    prisma.order.findUnique = originalOrderFindUnique;
    prisma.address.findFirst = originalAddressFindFirst;
    prisma.cart.findUnique = originalCartFindUnique;
    prisma.$transaction = originalTransaction;
  }
});

test("unavailable cart returns 409 with safe issue details", async () => {
  const originalFindUnique = prisma.user.findUnique;
  const originalOrderFindUnique = prisma.order.findUnique;
  const originalAddressFindFirst = prisma.address.findFirst;
  const originalCartFindUnique = prisma.cart.findUnique;
  const originalCartItemFindMany = prisma.cartItem.findMany;
  const originalTransaction = prisma.$transaction;
  prisma.user.findUnique = async () => customerUser();
  prisma.order.findUnique = async () => null;
  prisma.address.findFirst = async () => ({ id: "123e4567-e89b-12d3-a456-426614174000" });
  prisma.cart.findUnique = async () => ({ id: "cart-1" });
  prisma.cartItem.findMany = async () => [{
    id: "item-1",
    quantity: 2,
    productId: "product-1",
    variantId: "variant-1",
    product: { status: "DRAFT", shop: { id: "shop-1", name: "Shop", status: "ACTIVE" } },
    variant: { id: "variant-1", price: 15, discountPrice: null, stock: 5, isActive: true, shop: { status: "ACTIVE" } }
  }];
  prisma.$transaction = async () => { throw new Error("should not be called"); };

  const app = makeApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/customer/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ addressId: "123e4567-e89b-12d3-a456-426614174000", idempotencyKey: "test-key" })
    });
    const payload = await response.json();

    assert.equal(response.status, 409);
    assert.equal(payload.error.code, "CART_ITEM_UNAVAILABLE");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    prisma.user.findUnique = originalFindUnique;
    prisma.order.findUnique = originalOrderFindUnique;
    prisma.address.findFirst = originalAddressFindFirst;
    prisma.cart.findUnique = originalCartFindUnique;
    prisma.cartItem.findMany = originalCartItemFindMany;
    prisma.$transaction = originalTransaction;
  }
});
