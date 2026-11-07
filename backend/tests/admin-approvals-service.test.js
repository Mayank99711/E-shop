import assert from "node:assert/strict";
import test from "node:test";
import { createAdminApprovalService } from "../src/services/admin-approvals.js";

test("Admin approval creates the approved category and audit record in one transaction", async () => {
  const calls = [];
  const tx = {
    masterDataRequest: {
      findUnique: async () => ({ id: "request-a", type: "CATEGORY", proposedData: { name: " Footwear " }, status: "PENDING" }),
      updateMany: async (query) => (calls.push(["review", query]), { count: 1 })
    },
    category: { findUnique: async () => null, create: async ({ data }) => (calls.push(["category", data]), { id: "category-a" }) },
    auditLog: { create: async ({ data }) => calls.push(["audit", data]) }
  };
  const service = createAdminApprovalService({ $transaction: (callback) => callback(tx) });
  const result = await service.reviewRequest("request-a", "admin-a", "APPROVED", undefined);
  assert.deepEqual(result, { decision: "APPROVED", approvedRecord: { type: "CATEGORY", id: "category-a" } });
  assert.equal(calls.find(([kind]) => kind === "audit")[1].actorId, "admin-a");
});

test("Admin approval rejects a request that is no longer pending", async () => {
  const service = createAdminApprovalService({ $transaction: (callback) => callback({
    masterDataRequest: { findUnique: async () => ({ status: "APPROVED" }) }
  }) });
  await assert.rejects(() => service.reviewRequest("request-a", "admin-a", "REJECTED", "duplicate"), { code: "REQUEST_ALREADY_REVIEWED" });
});

test("Admin approval rejects invalid brand request data", async () => {
  const service = createAdminApprovalService({ $transaction: (callback) => callback({
    masterDataRequest: {
      findUnique: async () => ({ id: "request-b", type: "BRAND", proposedData: { name: "x" }, status: "PENDING" })
    }
  }) });

  await assert.rejects(
    () => service.reviewRequest("request-b", "admin-a", "APPROVED", undefined),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, "INVALID_REQUEST_DATA");
      return true;
    }
  );
});

test("Admin approval rejects invalid variant attribute request data", async () => {
  const service = createAdminApprovalService({ $transaction: (callback) => callback({
    masterDataRequest: {
      findUnique: async () => ({ id: "request-c", type: "VARIANT_ATTRIBUTE", proposedData: { name: "y" }, status: "PENDING" })
    }
  }) });

  await assert.rejects(
    () => service.reviewRequest("request-c", "admin-a", "APPROVED", undefined),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, "INVALID_REQUEST_DATA");
      return true;
    }
  );
});

test("Category approval validates and persists uploaded category images", async () => {
  const verifyCalls = [];
  const txCalls = [];
  const iconUrl = "/uploads/master-data/categories/icons/11111111-2222-3333-4444-555555555555.png";
  const imageUrl = "/uploads/master-data/categories/images/22222222-3333-4444-5555-666666666666.png";
  const tx = {
    masterDataRequest: {
      findUnique: async () => ({ id: "request-image", type: "CATEGORY", proposedData: { name: "Footwear", iconUrl, imageUrl }, status: "PENDING", requesterId: "owner-a", shopId: "shop-a" }),
      updateMany: async (query) => (txCalls.push(["review", query]), { count: 1 })
    },
    category: {
      findUnique: async () => null,
      create: async ({ data }) => (txCalls.push(["category", data]), { id: "category-a" }),
      update: async ({ data }) => (txCalls.push(["category-update", data]), { id: "category-a" })
    },
    auditLog: { create: async ({ data }) => txCalls.push(["audit", data]) }
  };
  const service = createAdminApprovalService(
    { $transaction: (callback) => callback(tx) },
    async (...args) => verifyCalls.push(args)
  );
  const result = await service.reviewRequest("request-image", "admin-a", "APPROVED", undefined);

  assert.deepEqual(result, { decision: "APPROVED", approvedRecord: { type: "CATEGORY", id: "category-a" } });
  assert.deepEqual(verifyCalls, [
    [iconUrl, "categoryIcon", "owner-a", "shop-a"],
    [imageUrl, "categoryImage", "owner-a", "shop-a"]
  ]);
  const categoryCall = txCalls.find(([kind]) => kind === "category")[1];
  assert.equal(categoryCall.iconUrl, iconUrl);
  assert.equal(categoryCall.imageUrl, imageUrl);
});

test("Brand approval validates and persists an uploaded logo", async () => {
  const verifyCalls = [];
  const txCalls = [];
  const logoUrl = "/uploads/master-data/brands/33333333-4444-5555-6666-777777777777.png";
  const tx = {
    masterDataRequest: {
      findUnique: async () => ({ id: "request-logo", type: "BRAND", proposedData: { name: "Acme", logoUrl }, status: "PENDING", requesterId: "owner-a", shopId: "shop-a" }),
      updateMany: async (query) => (txCalls.push(["review", query]), { count: 1 })
    },
    brand: {
      findUnique: async () => null,
      create: async ({ data }) => (txCalls.push(["brand", data]), { id: "brand-a" }),
      update: async ({ data }) => (txCalls.push(["brand-update", data]), { id: "brand-a" })
    },
    auditLog: { create: async ({ data }) => txCalls.push(["audit", data]) }
  };
  const service = createAdminApprovalService(
    { $transaction: (callback) => callback(tx) },
    async (...args) => verifyCalls.push(args)
  );
  const result = await service.reviewRequest("request-logo", "admin-a", "APPROVED", undefined);

  assert.deepEqual(result, { decision: "APPROVED", approvedRecord: { type: "BRAND", id: "brand-a" } });
  assert.deepEqual(verifyCalls, [[logoUrl, "brandLogo", "owner-a", "shop-a"]]);
  const brandCall = txCalls.find(([kind]) => kind === "brand")[1];
  assert.equal(brandCall.logoUrl, logoUrl);
});

test("Category approval reuses an existing category and only fills absent image fields", async () => {
  const txCalls = [];
  const tx = {
    masterDataRequest: {
      findUnique: async () => ({ id: "request-existing", type: "CATEGORY", proposedData: { name: "Footwear" }, status: "PENDING", requesterId: "owner-a", shopId: "shop-a" }),
      updateMany: async (query) => (txCalls.push(["review", query]), { count: 1 })
    },
    category: {
      findUnique: async () => ({ id: "category-existing", parentId: null, iconUrl: "/existing-icon.png", imageUrl: null }),
      update: async ({ data }) => (txCalls.push(["category-update", data]), { id: "category-existing" })
    },
    auditLog: { create: async ({ data }) => txCalls.push(["audit", data]) }
  };
  const service = createAdminApprovalService({ $transaction: (callback) => callback(tx) }, async () => {});
  const result = await service.reviewRequest("request-existing", "admin-a", "APPROVED", undefined);

  assert.deepEqual(result, { decision: "APPROVED", approvedRecord: { type: "CATEGORY", id: "category-existing" } });
  assert.equal(txCalls.some(([kind]) => kind === "category-update"), false);
});

test("Category approval rejects an invalid uploaded image", async () => {
  const tx = {
    masterDataRequest: {
      findUnique: async () => ({ id: "request-bad-image", type: "CATEGORY", proposedData: { name: "Footwear", iconUrl: "/uploads/master-data/categories/icons/bad.png" }, status: "PENDING", requesterId: "owner-a", shopId: "shop-a" })
    }
  };
  const service = createAdminApprovalService(
    { $transaction: (callback) => callback(tx) },
    async () => { throw Object.assign(new Error("bad image"), { code: "IMAGE_OWNERSHIP_MISMATCH", status: 403 }); }
  );
  await assert.rejects(() => service.reviewRequest("request-bad-image", "admin-a", "APPROVED", undefined), { code: "IMAGE_OWNERSHIP_MISMATCH" });
});
