import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerProductService } from "../src/services/owner-products.js";

test("Owner product listing is scoped to the selected owner's shop", async () => {
  let query;
  const service = createOwnerProductService({ product: { findMany: async (value) => (query = value, []) } }, async () => ({ id: "shop-a" }));
  assert.deepEqual(await service.list("owner-a"), []);
  assert.equal(query.where.shopId, "shop-a");
});

test("Owner product creation writes product, variants and audit in one transaction", async () => {
  const calls = [];
  const tx = {
    product: { create: async ({ data }) => (calls.push(["product", data.shopId]), { id: "product-a", images: [] }) },
    productVariant: { findMany: async () => [], create: async ({ data }) => (calls.push(["variant", data.shopId]), { id: "variant-a", sku: data.sku }) },
    auditLog: { create: async ({ data }) => calls.push(["audit", data.actorId]) }
  };
  const service = createOwnerProductService({
    category: { findFirst: async () => ({ id: "category-a" }) },
    brand: { findFirst: async () => null },
    $transaction: (callback) => callback(tx)
  }, async () => ({ id: "shop-a" }));
  const product = await service.create("owner-a", "owner-a", { name: "Shoe", description: "A shoe", categoryId: "category-a", images: [], variants: [{ sku: "SKU-A", values: [], price: "10", stock: 2 }] });
  assert.equal(product.variants[0].sku, "SKU-A");
  assert.ok(calls.every(([, scope]) => scope === "shop-a" || scope === "owner-a"));
});
