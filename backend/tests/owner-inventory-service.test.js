import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerInventoryService } from "../src/services/owner-inventory.js";

test("Owner inventory updates are tenant-scoped and audited", async () => {
  let where;
  let audit;
  const service = createOwnerInventoryService({
    productVariant: { findFirst: async (query) => (where = query.where, { id: "variant-a" }) },
    $transaction: (callback) => callback({
      productVariant: { update: async ({ data }) => ({ id: "variant-a", stock: data.stock }) },
      auditLog: { create: async ({ data }) => { audit = data; } }
    })
  }, async () => ({ id: "shop-a" }));
  await service.setStock("owner-a", "owner-a", "variant-a", 7);
  assert.equal(where.shopId, "shop-a");
  assert.equal(audit.action, "INVENTORY_STOCK_CHANGED");
});

test("Owner inventory service keeps discounted prices below regular price", async () => {
  const service = createOwnerInventoryService({
    productVariant: { findFirst: async () => ({ id: "variant-a", price: "10.00", discountPrice: "8.00" }) }
  }, async () => ({ id: "shop-a" }));
  await assert.rejects(() => service.updatePricing("owner-a", "owner-a", "variant-a", { price: "7.00" }), { code: "INVALID_DISCOUNT_PRICE" });
});
