import assert from "node:assert/strict";
import test from "node:test";
import { shopBusinessProfileSchema } from "../src/validators/shop-profile.js";

test("shop business profile accepts omitted fields", () => {
  const parsed = shopBusinessProfileSchema.safeParse({});

  assert.equal(parsed.success, true);
});

test("shop business profile normalizes blank optional fields to null", () => {
  const parsed = shopBusinessProfileSchema.safeParse({
    businessName: "  ",
    businessType: "",
    taxId: " ",
    businessAddress: "\t",
    logoUrl: ""
  });

  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, {
    businessName: null,
    businessType: null,
    taxId: null,
    businessAddress: null,
    logoUrl: null
  });
});

test("shop business profile accepts valid values and an HTTPS logo URL", () => {
  const profile = {
    businessName: "Example Retail Ltd",
    businessType: "Retail",
    taxId: "TAX-12345",
    businessAddress: "1 Market Road, Pune",
    logoUrl: "https://cdn.example.com/shop-logo.png"
  };

  assert.deepEqual(shopBusinessProfileSchema.parse(profile), profile);
});

test("shop business profile rejects non-HTTP logo URLs", () => {
  assert.equal(shopBusinessProfileSchema.safeParse({ logoUrl: "javascript:alert(1)" }).success, false);
});

test("shop business profile normalizes valid tax identifiers", () => {
  const parsed = shopBusinessProfileSchema.parse({
    gstNumber: "27aapfu0939f1zv",
    panNumber: "aaaaa9999a"
  });

  assert.deepEqual(parsed, {
    gstNumber: "27AAPFU0939F1ZV",
    panNumber: "AAAAA9999A"
  });
});

test("shop business profile rejects malformed GST and PAN identifiers", () => {
  assert.equal(shopBusinessProfileSchema.safeParse({ gstNumber: "NOT-A-GST" }).success, false);
  assert.equal(shopBusinessProfileSchema.safeParse({ panNumber: "BADPAN" }).success, false);
});
