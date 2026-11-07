import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 10;

const imageTypes = {
  "image/jpeg": { extension: "jpg", signature: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  "image/png": { extension: "png", signature: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { extension: "webp", signature: (buffer) => buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" }
};

const storedImagePattern = /^\/uploads\/products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

export function isStoredProductImage(url) {
  return storedImagePattern.test(url);
}

export function validateProductImage(file) {
  const imageType = Object.hasOwn(imageTypes, file.mimetype) ? imageTypes[file.mimetype] : null;
  if (!imageType || !Buffer.isBuffer(file.buffer) || !imageType.signature(file.buffer)) {
    const error = new Error("Upload a valid JPEG, PNG, or WebP image.");
    error.status = 400;
    error.code = "INVALID_IMAGE";
    throw error;
  }
  return imageType.extension;
}

export async function saveProductImages(files, uploadDirectory) {
  const extensions = files.map(validateProductImage);
  await mkdir(uploadDirectory, { recursive: true });
  const saved = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const extension = extensions[index];
      const filename = `${randomUUID()}.${extension}`;
      const filePath = path.join(uploadDirectory, filename);
      await writeFile(filePath, file.buffer, { flag: "wx" });
      saved.push({ path: filePath, url: `/uploads/products/${filename}` });
    }
    return saved;
  } catch (error) {
    try {
      await removeProductImageFiles(saved.map(({ path: filePath }) => filePath));
    } catch (cleanupError) {
      console.error("Could not clean up product image files after an upload failure.", cleanupError);
    }
    throw error;
  }
}

export async function removeProductImageFiles(filePaths) {
  const failures = [];
  for (const filePath of filePaths) {
    try {
      await unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        failures.push(error);
      }
    }
  }
  if (failures.length) {
    const error = new Error("One or more product image files could not be removed.");
    error.cause = failures[0];
    throw error;
  }
}
