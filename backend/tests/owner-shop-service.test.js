import assert from "node:assert/strict";
import test from "node:test";
import { getOwnerShop, updateOwnerShopProfile } from "../src/services/owner-shop.js";

test("owner shop lookup always scopes the row to the authenticated owner", async () => {
  let query;
  const shop = { id: "shop-1", ownerId: "owner-1", name: "Fixture Shop" };
  const database = { shop: { findUnique: async (options) => { query = options; return shop; } } };
  assert.equal(await getOwnerShop("owner-1", database), shop);
  assert.deepEqual(query.where, { ownerId: "owner-1" });
  assert.equal(query.select.businessAddress, true);
});

test("owner business profile update and audit event share one transaction", async () => {
  const calls = [];
  const database = {
    shop: { findUnique: async () => ({ id: "shop-1", ownerId: "owner-1" }) },
    $transaction: async (operation) => operation({
      shop: { update: async (options) => { calls.push(["update", options]); return { id: "shop-1", ...options.data }; } },
      auditLog: { create: async (options) => { calls.push(["audit", options]); } }
    })
  };
  const profile = { contactPhone: "+911234567890" };
  const updated = await updateOwnerShopProfile("owner-1", "owner-1", profile, database);
  assert.deepEqual(updated, { id: "shop-1", contactPhone: "+911234567890" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "update");
  assert.equal(calls[0][1].where.id, "shop-1");
  assert.deepEqual(calls[1][1].data, {
    actorId: "owner-1",
    action: "SHOP_BUSINESS_PROFILE_UPDATED",
    targetType: "SHOP",
    targetId: "shop-1",
    metadata: { fields: ["contactPhone"] }
  });
});

test("owner shop lookup returns the stable not-found error when no owned shop exists", async () => {
  const database = { shop: { findUnique: async () => null } };
  await assert.rejects(getOwnerShop("owner-missing", database), (error) => {
    assert.equal(error.status, 404);
    assert.equal(error.code, "SHOP_NOT_FOUND");
    return true;
  });
});
