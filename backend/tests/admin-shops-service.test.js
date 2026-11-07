import assert from "node:assert/strict";
import test from "node:test";
import { createAdminShopService } from "../src/services/admin-shops.js";

test("admin shop status changes are transactional and audited", async () => {
  let audit;
  let ownerUpdate;
  const tx = {
    shop: { update: async ({ data }) => ({ id: "shop-a", status: data.status, archivedAt: data.archivedAt ?? null }) },
    user: { update: async (query) => { ownerUpdate = query; return {}; } },
    auditLog: { create: async ({ data }) => { audit = data; } }
  };
  const database = {
    shop: { findUnique: async ({ where }) => (where.id === "shop-a" ? { id: "shop-a", ownerId: "owner-a", status: "ACTIVE", archivedAt: null } : null) },
    $transaction: (callback) => callback(tx)
  };
  const service = createAdminShopService(database);
  const shop = await service.setStatus("shop-a", "admin-a", "ARCHIVED");

  assert.equal(shop.status, "ARCHIVED");
  assert.ok(shop.archivedAt instanceof Date);
  assert.equal(ownerUpdate.where.id, "owner-a");
  assert.deepEqual(ownerUpdate.data, { sessionVersion: { increment: 1 } });
  assert.equal(audit.actorId, "admin-a");
  assert.equal(audit.action, "SHOP_STATUS_CHANGED");
  assert.equal(audit.targetId, "shop-a");
  assert.equal(audit.metadata.previousStatus, "ACTIVE");
  assert.equal(audit.metadata.status, "ARCHIVED");
});

test("admin shop status change preserves an existing archive timestamp", async () => {
  const archivedAt = new Date("2026-01-01T00:00:00.000Z");
  const tx = {
    shop: { update: async ({ data }) => ({ id: "shop-a", status: data.status, archivedAt: data.archivedAt ?? archivedAt }) },
    user: { update: async () => ({}) },
    auditLog: { create: async () => {} }
  };
  const database = {
    shop: { findUnique: async () => ({ id: "shop-a", ownerId: "owner-a", status: "ARCHIVED", archivedAt }) },
    $transaction: (callback) => callback(tx)
  };
  const service = createAdminShopService(database);
  const shop = await service.setStatus("shop-a", "admin-a", "ACTIVE");
  assert.equal(shop.status, "ACTIVE");
  assert.equal(shop.archivedAt, archivedAt);
});

test("admin shop status change rejects an unknown shop", async () => {
  const database = { shop: { findUnique: async () => null } };
  const service = createAdminShopService(database);
  await assert.rejects(() => service.setStatus("missing-shop", "admin-a", "ACTIVE"), { code: "SHOP_NOT_FOUND", status: 404 });
});

test("admin shop creation creates owner, shop, activation token, and audit", async () => {
  let tokenData;
  let audit;
  const tx = {
    user: { create: async ({ data }) => ({ id: "owner-a", ownerCode: data.ownerCode, name: data.name, email: data.email }) },
    shop: { create: async ({ data }) => ({ id: "shop-a", code: data.code, name: data.name, status: data.status }) },
    ownerActivationToken: { create: async ({ data }) => { tokenData = data; return {}; } },
    auditLog: { create: async ({ data }) => { audit = data; } }
  };
  const database = {
    user: { findUnique: async () => null },
    shopCategory: { findFirst: async () => ({ id: "category-a" }) },
    $transaction: (callback) => callback(tx)
  };
  const service = createAdminShopService(database);
  const result = await service.create("admin-a", {
    shopName: "Test Shop",
    ownerFirstName: "Test",
    ownerLastName: "Owner",
    ownerEmail: "owner@example.com",
    ownerMobile: "9999999999",
    shopCategoryId: "category-a",
    status: "PENDING",
    businessAddress: "123 Test Street"
  });

  assert.equal(result.shop.id, "shop-a");
  assert.equal(result.owner.id, "owner-a");
  assert.equal(result.owner.email, "owner@example.com");
  assert.equal(typeof result.token, "string");
  assert.equal(result.token.length, 64);
  assert.equal(tokenData.userId, "owner-a");
  assert.ok(tokenData.expiresAt instanceof Date);
  assert.equal(audit.actorId, "admin-a");
  assert.equal(audit.action, "SHOP_CREATED");
  assert.equal(audit.targetId, "shop-a");
  assert.equal(audit.metadata.ownerId, "owner-a");
  assert.equal(audit.metadata.status, "PENDING");
});

test("admin shop creation rejects an existing owner email", async () => {
  const database = { user: { findUnique: async () => ({ id: "existing-owner" }) } };
  const service = createAdminShopService(database);
  await assert.rejects(() => service.create("admin-a", {
    shopName: "Test Shop",
    ownerFirstName: "Test",
    ownerLastName: "Owner",
    ownerEmail: "owner@example.com",
    status: "PENDING"
  }), { code: "EMAIL_IN_USE", status: 409 });
});

test("admin shop creation rejects an inactive or missing category", async () => {
  const database = {
    user: { findUnique: async () => null },
    shopCategory: { findFirst: async () => null }
  };
  const service = createAdminShopService(database);
  await assert.rejects(() => service.create("admin-a", {
    shopName: "Test Shop",
    ownerFirstName: "Test",
    ownerLastName: "Owner",
    ownerEmail: "owner@example.com",
    shopCategoryId: "category-a",
    status: "PENDING"
  }), { code: "INVALID_SHOP_CATEGORY", status: 400 });
});

test("admin shop update validates category and audits the change", async () => {
  let audit;
  const tx = {
    shop: { update: async ({ data }) => ({ id: "shop-a", name: data.name, categoryId: data.categoryId }) },
    auditLog: { create: async ({ data }) => { audit = data; } }
  };
  const database = {
    shop: { findUnique: async () => ({ id: "shop-a", categoryId: "old-category" }) },
    category: { findFirst: async () => ({ id: "new-category" }) },
    $transaction: (callback) => callback(tx)
  };
  const service = createAdminShopService(database);
  const shop = await service.update("shop-a", "admin-a", { name: "Updated Shop", categoryId: "new-category" });

  assert.equal(shop.id, "shop-a");
  assert.equal(shop.name, "Updated Shop");
  assert.equal(audit.actorId, "admin-a");
  assert.equal(audit.action, "SHOP_UPDATED");
  assert.equal(audit.targetId, "shop-a");
});

test("admin shop update rejects an unknown shop", async () => {
  const database = { shop: { findUnique: async () => null } };
  const service = createAdminShopService(database);
  await assert.rejects(() => service.update("missing-shop", "admin-a", { name: "Updated Shop" }), { code: "SHOP_NOT_FOUND", status: 404 });
});
