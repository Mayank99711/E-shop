import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createOwnerProductImageService } from "../src/services/owner-product-images.js";

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("Owner product image upload stores the file and persists its image reference", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eshop-owner-product-images-"));
  const images = [];
  const transaction = {
    $queryRaw: async () => [],
    productImage: {
      findMany: async () => images,
      createMany: async ({ data }) => { images.push(...data.map((item, index) => ({ id: `image-${images.length + index}`, ...item }))); }
    },
    auditLog: { create: async () => ({}) }
  };
  const database = {
    product: { findFirst: async () => ({ id: "product-a" }) },
    $transaction: async (action) => action(transaction)
  };
  try {
    const service = createOwnerProductImageService(database, async () => ({ id: "shop-a" }), directory);
    const result = await service.upload("owner-a", "owner-a", "product-a", [{
      mimetype: "image/png",
      buffer: pngHeader,
      size: pngHeader.length
    }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].productId, "product-a");
    assert.deepEqual(await readFile(path.join(directory, result[0].url.slice("/uploads/products/".length))), pngHeader);
    assert.equal(images[0].url, result[0].url);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Owner product image upload is shop-scoped before writing any image files", async () => {
  let upload = false;
  const service = createOwnerProductImageService({ product: { findFirst: async ({ where }) => (assert.equal(where.shopId, "shop-a"), null) } }, async () => ({ id: "shop-a" }), "unused");
  await assert.rejects(() => service.upload("owner-a", "owner-a", "foreign-product", [{ size: 1 }]), { code: "PRODUCT_NOT_FOUND" });
  assert.equal(upload, false);
});

test("Owner image deletion cannot address another shop's image", async () => {
  const service = createOwnerProductImageService({ productImage: { findFirst: async ({ where }) => (assert.equal(where.product.shopId, "shop-a"), null) } }, async () => ({ id: "shop-a" }), "unused");
  await assert.rejects(() => service.remove("owner-a", "owner-a", "product-a", "foreign-image"), { code: "PRODUCT_IMAGE_NOT_FOUND" });
});
