import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerWholesalerService } from "../src/services/owner-wholesalers.js";

test("owner sees only authorized active wholesalers", async () => {
  const database = {
    shop: { findUnique: async () => ({ id: "shop-a" }) },
    shopWholesaler: {
      findMany: async () => ([
        { wholesaler: { id: "w-a", code: "WHO-1", name: "Whole One", status: "ACTIVE" } },
        { wholesaler: { id: "w-b", code: "WHO-2", name: "Whole Two", status: "INACTIVE" } }
      ])
    }
  };
  const service = createOwnerWholesalerService(database, async () => ({ id: "shop-a" }));
  const items = await service.listAuthorized("owner-a");
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "w-a");
});

test("owner with no shop cannot list wholesalers", async () => {
  const service = createOwnerWholesalerService({}, async () => { throw Object.assign(new Error("not found"), { code: "SHOP_NOT_FOUND", status: 404 }); });
  await assert.rejects(() => service.listAuthorized("owner-a"), { code: "SHOP_NOT_FOUND", status: 404 });
});
