import assert from "node:assert/strict";
import test from "node:test";
import { createProductVariants } from "../src/services/owner-product-variants.js";

test("owner variant service rejects duplicate SKU before database writes", async () => {
  let writes = 0;
  await assert.rejects(() => createProductVariants({ productVariant: { findMany: async () => { writes += 1; return []; }, create: async () => { writes += 1; } } }, "shop-a", "product-a", [
    { sku: "DUP", values: [], price: "10", stock: 1 }, { sku: "DUP", values: [], price: "12", stock: 1 }
  ]), { code: "DUPLICATE_SKU" });
  assert.equal(writes, 0);
});

test("owner variant service rejects option values that do not belong to an active attribute", async () => {
  const transaction = {
    productVariant: { findMany: async () => [], create: async () => assert.fail("must not create invalid option") },
    variantAttribute: { findMany: async () => [{ id: "attribute-a" }] },
    variantAttributeValue: { findMany: async () => [{ id: "value-a", attributeId: "attribute-b" }] }
  };
  await assert.rejects(() => createProductVariants(transaction, "shop-a", "product-a", [
    { sku: "SKU-A", values: [{ attributeId: "attribute-a", valueId: "value-a" }], price: "10", stock: 1 }
  ]), { code: "INVALID_VARIANT_OPTION" });
});
