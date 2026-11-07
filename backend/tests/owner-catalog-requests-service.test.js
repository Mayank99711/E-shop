import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerCatalogRequestService } from "../src/services/owner-catalog-requests.js";

test("Owner catalog request submission scopes the request and audit to its shop and actor", async () => {
  let requestData;
  let auditData;
  const service = createOwnerCatalogRequestService({
    brand: { findUnique: async () => null },
    masterDataRequest: { findMany: async () => [] },
    $transaction: (callback) => callback({
      masterDataRequest: { create: async ({ data }) => (requestData = data, { id: "request-a" }) },
      auditLog: { create: async ({ data }) => { auditData = data; } }
    })
  }, async () => ({ id: "shop-a" }));
  await service.submit("owner-a", "owner-a", "BRAND", { name: "New Brand" });
  assert.equal(requestData.shopId, "shop-a");
  assert.equal(requestData.requesterId, "owner-a");
  assert.equal(auditData.actorId, "owner-a");
});

test("Owner catalog requests reject duplicate pending normalized names", async () => {
  const service = createOwnerCatalogRequestService({
    brand: { findUnique: async () => null },
    masterDataRequest: { findMany: async () => [{ proposedData: { name: "New Brand" } }] }
  }, async () => ({ id: "shop-a" }));
  await assert.rejects(() => service.submit("owner-a", "owner-a", "BRAND", { name: " new brand " }), { code: "REQUEST_ALREADY_PENDING" });
});
