import assert from "node:assert/strict";
import test from "node:test";
import { getAdminDashboard } from "../src/services/admin-dashboard.js";

test("admin dashboard aggregates platform metrics and only counts paid revenue", async () => {
  const predicates = [];
  const database = {
    shop: { count: async ({ where }) => { predicates.push(where); return 4; }, findMany: async () => [{ id: "shop-1" }] },
    user: { count: async ({ where }) => where.role === "SHOP_OWNER" ? 2 : 8 },
    employee: { count: async () => 3 },
    product: { count: async () => 12 },
    masterDataRequest: { count: async () => 1, findMany: async () => [] },
    order: { count: async () => 6, findMany: async () => [{ id: "order-1" }] },
    payment: { aggregate: async ({ where }) => { assert.deepEqual(where, { status: "PAID" }); return { _sum: { amount: "125.50" } }; } }
  };
  const dashboard = await getAdminDashboard(database);
  assert.deepEqual(dashboard.metrics, {
    shops: 4,
    owners: 2,
    employees: 3,
    customers: 8,
    activeProducts: 12,
    pendingRequests: 1,
    orders: 6,
    paidRevenue: "125.50"
  });
  assert.equal(dashboard.recent.shops.length, 1);
  assert.equal(dashboard.recent.orders.length, 1);
  assert.deepEqual(predicates[0], { status: { not: "ARCHIVED" } });
});
