import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isStoredProductImage,
  removeProductImageFiles,
  saveProductImages,
  validateProductImage
} from "../src/utils/product-images.js";

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("product image upload validates MIME against image file signatures", () => {
  assert.equal(validateProductImage({ mimetype: "image/png", buffer: pngHeader }), "png");
  assert.throws(
    () => validateProductImage({ mimetype: "image/jpeg", buffer: pngHeader }),
    { code: "INVALID_IMAGE", status: 400 }
  );
  assert.throws(
    () => validateProductImage({ mimetype: "image/svg+xml", buffer: Buffer.from("<svg/>") }),
    { code: "INVALID_IMAGE", status: 400 }
  );
  assert.throws(
    () => validateProductImage({ mimetype: "constructor", buffer: pngHeader }),
    { code: "INVALID_IMAGE", status: 400 }
  );
});

test("stored product image references cannot escape the upload directory", () => {
  assert.equal(isStoredProductImage("/uploads/products/01234567-89ab-cdef-0123-456789abcdef.webp"), true);
  assert.equal(isStoredProductImage("/uploads/products/../../secret.webp"), false);
  assert.equal(isStoredProductImage("https://example.com/image.png"), false);
});

test("product image files are stored under random names and can be removed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eshop-product-images-"));
  try {
    const [saved] = await saveProductImages([{ mimetype: "image/png", buffer: pngHeader }], directory);
    assert.match(saved.url, /^\/uploads\/products\/[0-9a-f-]{36}\.png$/);
    assert.deepEqual(await readFile(saved.path), pngHeader);
    await removeProductImageFiles([saved.path]);
    await assert.rejects(readFile(saved.path), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
