import assert from "node:assert/strict";
import test from "node:test";
import { createAdminCatalogService } from "../src/services/admin-catalog.js";

test("Admin catalog service keeps category hierarchy and product counters", async () => {
  let query;
  const service = createAdminCatalogService({ category: { findMany: async (value) => (query = value, []) } });
  await service.listCategories();
  assert.deepEqual(query.orderBy, [{ parentId: "asc" }, { name: "asc" }]);
  assert.equal(query.include._count.select.children, true);
});

test("Admin catalog service requests nested variant values in stable order", async () => {
  let query;
  const service = createAdminCatalogService({ variantAttribute: { findMany: async (value) => (query = value, []) } });
  await service.listVariantAttributes();
  assert.deepEqual(query.include.values.orderBy, { value: "asc" });
});
