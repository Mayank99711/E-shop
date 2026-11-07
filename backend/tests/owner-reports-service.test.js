import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerReportsService } from "../src/services/owner-reports.js";

test("owner payments and reports are scoped to the authenticated owner's shop", async () => {
  const calls = [];
  const scoped = (method, result) => async (query) => {
    calls.push([method, query]);
    return result;
  };
  const database = {
    payment: {
      findMany: scoped("payment-list", []),
      groupBy: scoped("payment-statuses", [{ status: "PAID", _count: { _all: 2 } }]),
      aggregate: scoped("payment-total", { _sum: { amount: "75.00" } }),
    },
    shopOrder: {
      count: scoped("order-count", 3),
      groupBy: scoped("order-statuses", [{ status: "DELIVERED", _count: { _all: 2 } }]),
    },
    product: {
      count: async ({ where }) => where.status === "ACTIVE" ? 4 : 5,
    },
    productVariant: {
      aggregate: scoped("inventory", { _sum: { stock: 12 } }),
      count: async () => 3,
    },
    employee: { count: scoped("employees", 2) },
  };
  const service = createOwnerReportsService(database, async (ownerId) => {
    assert.equal(ownerId, "owner-a");
    return { id: "shop-a" };
  });

  await service.listPayments("owner-a");
  const report = await service.getReports("owner-a");

  assert.equal(report.orderCount, 3);
  assert.equal(report.paidPaymentTotal, "75.00");
  assert.deepEqual(report.orderStatuses, [{ status: "DELIVERED", count: 2 }]);
  assert.deepEqual(report.paymentStatuses, [{ status: "PAID", count: 2 }]);
  assert.equal(report.products.total, 5);
  assert.equal(report.products.active, 4);
  assert.equal(report.activeEmployees, 2);
  for (const [name, query] of calls) {
    if (name === "payment-list" || name === "payment-statuses" || name === "payment-total") {
      assert.deepEqual(query.where.order.shopOrders, { some: { shopId: "shop-a" } });
    } else if (query.where?.shopId) {
      assert.equal(query.where.shopId, "shop-a");
    }
  }
});
