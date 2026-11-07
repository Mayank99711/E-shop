import assert from "node:assert/strict";
import test from "node:test";

process.env.SESSION_SECRET ??= "catalog-request-test-session-secret-with-more-than-32-characters";

const { masterDataRequestSchema } = await import("../src/routes/owner.js");

test("catalog request validation accepts category and brand details", () => {
  const category = masterDataRequestSchema.safeParse({
    type: "CATEGORY",
    proposedData: {
      name: "  Outdoor Living ",
      parentId: null,
      description: "Products for patios and gardens",
      businessJustification: "Customers need a clear place to find these items.",
      supportingInfo: "Requested by multiple customers."
    }
  });
  const brand = masterDataRequestSchema.safeParse({
    type: "BRAND",
    proposedData: {
      name: "Example Brand",
      website: "https://example.com",
      logoUrl: "/uploads/master-data/brands/11111111-2222-3333-4444-555555555555.png",
      businessJustification: "This brand is not in the shared catalog."
    }
  });

  assert.equal(category.success, true);
  assert.equal(brand.success, true);
});

test("catalog request validation accepts variant attribute and value details", () => {
  const attribute = masterDataRequestSchema.safeParse({
    type: "VARIANT_ATTRIBUTE",
    proposedData: {
      name: "Material",
      businessJustification: "Customers need to select product material."
    }
  });
  const value = masterDataRequestSchema.safeParse({
    type: "VARIANT_VALUE",
    proposedData: {
      attributeId: "7e84be4a-f242-46ce-a0ab-fbe69d64e8e8",
      value: "Recycled cotton",
      supportingInfo: "Use for textiles made from recycled fiber."
    }
  });

  assert.equal(attribute.success, true);
  assert.equal(value.success, true);
});

test("catalog request validation rejects invalid optional brand URLs", () => {
  const result = masterDataRequestSchema.safeParse({
    type: "BRAND",
    proposedData: {
      name: "Example Brand",
      website: "javascript:alert(1)"
    }
  });

  assert.equal(result.success, false);
});
