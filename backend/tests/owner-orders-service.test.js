import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerOrdersService } from "../src/services/owner-orders.js";

test("Owner order status transition is shop-scoped and audits atomically", async () => {
  const calls = [];
  const tx = {
    shopOrder: {
      updateMany: async (query) => (calls.push(["update", query]), { count: 1 }),
      findMany: async (query) => (calls.push(["siblings", query]), [{ status: "CONFIRMED" }])
    },
    orderStatusHistory: { create: async ({ data }) => calls.push(["history", data]) },
    order: { update: async ({ data }) => calls.push(["parent", data]) },
    auditLog: { create: async ({ data }) => calls.push(["audit", data]) }
  };
  const service = createOwnerOrdersService({
    shopOrder: { findFirst: async ({ where }) => (assert.equal(where.shopId, "shop-a"), { id: "order-a", orderId: "parent-a", status: "PLACED", order: { payments: [{ provider: "RAZORPAY", status: "PAID" }] } }) },
    $transaction: (callback) => callback(tx)
  }, async (ownerId) => (assert.equal(ownerId, "owner-a"), { id: "shop-a" }));
  assert.deepEqual(await service.updateStatus("owner-a", "order-a", "owner-a", "CONFIRMED"), { id: "order-a", status: "CONFIRMED" });
  assert.equal(calls.find(([kind]) => kind === "audit")[1].actorId, "owner-a");
});

test("Owner order listing includes only delivery fields from the linked address", async () => {
  let query;
  const address = {
    recipient: "Customer",
    mobile: "9999999999",
    line1: "1 Market Road",
    line2: null,
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411001",
    country: "India",
  };
  const service = createOwnerOrdersService({
    shopOrder: {
      findMany: async (value) => {
        query = value;
        return [{ order: { address }, items: [] }];
      },
    },
  }, async () => ({ id: "shop-a" }));

  const result = await service.list("owner-a");
  assert.deepEqual(result[0].order.address, address);
  assert.deepEqual(query.include.order.select.address.select, {
    recipient: true,
    mobile: true,
    line1: true,
    line2: true,
    city: true,
    region: true,
    postalCode: true,
    country: true,
  });
});

test("Owner order service rejects skipped status transitions", async () => {
  const service = createOwnerOrdersService({ shopOrder: { findFirst: async () => ({ id: "order-a", status: "PLACED" }) } }, async () => ({ id: "shop-a" }));
  await assert.rejects(() => service.updateStatus("owner-a", "order-a", "owner-a", "SHIPPED"), { code: "INVALID_ORDER_TRANSITION" });
});

test("Owner order service rejects Razorpay orders until payment is verified", async () => {
  for (const paymentStatus of ["PENDING", "AUTHORIZED", "FAILED"]) {
    const service = createOwnerOrdersService({
      shopOrder: {
        findFirst: async () => ({
          id: "order-a",
          orderId: "parent-a",
          status: "PLACED",
          order: { payments: [{ provider: "RAZORPAY", status: paymentStatus }] }
        })
      }
    }, async () => ({ id: "shop-a" }));
    await assert.rejects(
      () => service.updateStatus("owner-a", "order-a", "owner-a", "CONFIRMED"),
      { code: "PAYMENT_NOT_VERIFIED" }
    );
  }
});

test("Owner order status transitions keep COD orders available without online verification", async () => {
  const tx = {
    shopOrder: {
      updateMany: async () => ({ count: 1 }),
      findMany: async () => [{ status: "CONFIRMED" }],
    },
    orderStatusHistory: { create: async () => {} },
    order: { update: async () => {} },
    auditLog: { create: async () => {} },
  };
  const service = createOwnerOrdersService({
    shopOrder: {
      findFirst: async () => ({
        id: "shop-order-a",
        orderId: "order-a",
        status: "PLACED",
        order: { payments: [{ provider: "COD", status: "PENDING" }] },
      }),
    },
    $transaction: (callback) => callback(tx),
  }, async () => ({ id: "shop-a" }));

  assert.deepEqual(
    await service.updateStatus("owner-a", "shop-order-a", "owner-a", "CONFIRMED"),
    { id: "shop-order-a", status: "CONFIRMED" },
  );
});
