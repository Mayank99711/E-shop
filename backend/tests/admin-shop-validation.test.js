import test from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET ??= "admin-shop-test-session-secret-with-more-than-32-characters";

const { createShopSchema } = await import("../src/routes/admin.js");

const validShop = {
  shopName: "Test Shop",
  ownerName: "Test Owner",
  ownerEmail: "owner@example.com"
};

test("shop creation accepts a blank optional owner mobile and normalizes it to missing", () => {
  const parsed = createShopSchema.safeParse({ ...validShop, ownerMobile: "   " });

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.ownerMobile, undefined);
});

test("shop creation accepts a missing optional owner mobile", () => {
  const parsed = createShopSchema.safeParse(validShop);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.ownerMobile, undefined);
});

test("shop creation accepts the new first/last-name workflow without owner mobile", () => {
  const parsed = createShopSchema.safeParse({
    shopName: "Test Shop",
    shopCategoryId: "7e84be4a-f242-46ce-a0ab-fbe69d64e8e8",
    businessAddress: "1 Market Road",
    ownerFirstName: "Test",
    ownerLastName: "Owner",
    ownerEmail: "owner@example.com"
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.ownerMobile, undefined);
});

test("shop creation trims and accepts a valid owner mobile", () => {
  const parsed = createShopSchema.safeParse({ ...validShop, ownerMobile: " +1 555 123 4567 " });

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.ownerMobile, "+1 555 123 4567");
});

test("shop creation validates commission percentages to two decimal places", () => {
  for (const commissionPercentage of [0, 0.25, 100, "12.34"]) {
    assert.equal(createShopSchema.safeParse({ ...validShop, commissionPercentage }).success, true);
  }
  for (const commissionPercentage of [-0.01, 100.01, 12.345]) {
    assert.equal(createShopSchema.safeParse({ ...validShop, commissionPercentage }).success, false);
  }
});

test("shop creation continues rejecting nonblank owner mobiles outside the allowed length", () => {
  assert.equal(createShopSchema.safeParse({ ...validShop, ownerMobile: "123456" }).success, false);
  assert.equal(createShopSchema.safeParse({ ...validShop, ownerMobile: "1".repeat(21) }).success, false);
  assert.equal(createShopSchema.safeParse({
    shopName: "Test Shop",
    shopCategoryId: "7e84be4a-f242-46ce-a0ab-fbe69d64e8e8",
    businessAddress: "1 Market Road",
    ownerFirstName: "Test",
    ownerLastName: "Owner",
    ownerEmail: "owner@example.com",
    ownerMobile: "123456"
  }).success, false);
});
