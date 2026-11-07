import assert from "node:assert/strict";
import test from "node:test";
import { createAdminWholesalerService } from "../src/services/admin-wholesalers.js";

test("admin creates a wholesaler", async () => {
  const database = {
    wholesaler: {
      findUnique: async () => null,
      create: async ({ data }) => ({ id: "w-a", ...data })
    }
  };
  const service = createAdminWholesalerService(database);
  const wholesaler = await service.create({ code: "WHO-1", name: "Whole One", status: "ACTIVE" });
  assert.equal(wholesaler.id, "w-a");
  assert.equal(wholesaler.code, "WHO-1");
});

test("duplicate wholesaler code is rejected", async () => {
  const database = { wholesaler: { findUnique: async () => ({ id: "w-a" }) } };
  const service = createAdminWholesalerService(database);
  await assert.rejects(() => service.create({ code: "WHO-1", name: "Whole One" }), { code: "DUPLICATE_WHOLESALER_CODE", status: 409 });
});

test("admin assigns and revokes wholesaler authorization", async () => {
  const tx = {};
  const database = {
    shop: { findUnique: async () => ({ id: "shop-a" }) },
    wholesaler: { findUnique: async () => ({ id: "w-a", status: "ACTIVE" }) },
    shopWholesaler: {
      findUnique: async () => null,
      create: async ({ data }) => ({ id: "auth-a", ...data, wholesaler: { id: "w-a", code: "WHO-1", name: "Whole One", status: "ACTIVE" } })
    }
  };
  const service = createAdminWholesalerService(database);
  const assigned = await service.assignShopWholesaler("shop-a", "w-a");
  assert.equal(assigned.id, "auth-a");

  const revokeDb = {
    shopWholesaler: { findUnique: async () => ({ id: "auth-a", isActive: true }), update: async () => ({}) }
  };
  const revokeService = createAdminWholesalerService(revokeDb);
  const revoked = await revokeService.revokeShopWholesaler("shop-a", "w-a");
  assert.equal(revoked.revoked, true);
});

test("duplicate assignment is rejected", async () => {
  const database = {
    shop: { findUnique: async () => ({ id: "shop-a" }) },
    wholesaler: { findUnique: async () => ({ id: "w-a", status: "ACTIVE" }) },
    shopWholesaler: { findUnique: async () => ({ id: "auth-a", isActive: true }) }
  };
  const service = createAdminWholesalerService(database);
  await assert.rejects(() => service.assignShopWholesaler("shop-a", "w-a"), { code: "DUPLICATE_AUTHORIZATION", status: 409 });
});

test("inactive wholesaler cannot be assigned", async () => {
  const database = {
    shop: { findUnique: async () => ({ id: "shop-a" }) },
    wholesaler: { findUnique: async () => ({ id: "w-a", status: "INACTIVE" }) }
  };
  const service = createAdminWholesalerService(database);
  await assert.rejects(() => service.assignShopWholesaler("shop-a", "w-a"), { code: "WHOLESALER_INACTIVE", status: 409 });
});
