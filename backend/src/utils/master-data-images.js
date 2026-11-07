import { randomUUID } from "node:crypto";
import {
  mkdir,
  unlink,
  writeFile,
  readFile,
  stat
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateProductImage,
  MAX_PRODUCT_IMAGE_BYTES
} from "./product-images.js";

export const MAX_MASTER_DATA_IMAGE_BYTES = MAX_PRODUCT_IMAGE_BYTES;

const extensionToMimeType = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

const imageDirectories = {
  categoryIcon: "categories/icons",
  categoryImage: "categories/images",
  brandLogo: "brands"
};

const uploadRoot = fileURLToPath(
  new URL("../../uploads/master-data/", import.meta.url)
);

export async function saveMasterDataImage(
  file,
  imageType,
  ownerId,
  shopId
) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw createImageError("Please select an image.");
  }

  if (!ownerId || !shopId) {
    throw createImageError(
      "Image owner information is missing.",
      403,
      "INVALID_IMAGE_OWNER"
    );
  }

  if (file.size > MAX_MASTER_DATA_IMAGE_BYTES) {
    throw createImageError(
      "Image must be 5 MB or smaller.",
      413,
      "IMAGE_TOO_LARGE"
    );
  }

  const relativeDirectory = imageDirectories[imageType];

  if (!relativeDirectory) {
    throw createImageError("Invalid image type.");
  }

  const extension = validateProductImage(file);
  const filename = `${randomUUID()}.${extension}`;

  const directory = path.join(uploadRoot, relativeDirectory);
  const filePath = path.join(directory, filename);
  const metadataPath = `${filePath}.json`;

  const url = `/uploads/master-data/${relativeDirectory}/${filename}`;

  const metadata = {
    imageUrl: url,
    imageType,
    ownerId,
    shopId,
    createdAt: new Date().toISOString()
  };

  await mkdir(directory, { recursive: true });

  try {
    await writeFile(filePath, file.buffer, { flag: "wx" });

    await writeFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      { flag: "wx" }
    );

    return {
      url,
      path: filePath
    };
  } catch (error) {
    await Promise.allSettled([
      unlink(filePath),
      unlink(metadataPath)
    ]);

    throw error;
  }
}

export async function verifyMasterDataImage(
  imageUrl,
  imageType,
  ownerId,
  shopId
) {
  const relativeDirectory = imageDirectories[imageType];

  if (!relativeDirectory) {
    throw createImageError("Invalid image type.");
  }

  const prefix = `/uploads/master-data/${relativeDirectory}/`;

  if (!imageUrl.startsWith(prefix)) {
    throw createImageError(
      "Image type does not match the request."
    );
  }

  const filename = imageUrl.slice(prefix.length);

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(filename)
  ) {
    throw createImageError("Invalid image URL.");
  }

  const filePath = path.join(
    uploadRoot,
    relativeDirectory,
    filename
  );

  try {
    const fileInfo = await stat(filePath);

    if (!fileInfo.isFile()) {
      throw createImageError("Image file is invalid.");
    }

    const extension = filename.split(".").pop().toLowerCase();
    const mimeType = extensionToMimeType[extension];
    if (!mimeType) {
      throw createImageError("Invalid image URL.");
    }
    validateProductImage({ mimetype: mimeType, buffer: await readFile(filePath) });

    const metadata = JSON.parse(
      await readFile(`${filePath}.json`, "utf8")
    );

    if (
      metadata.ownerId !== ownerId ||
      metadata.shopId !== shopId ||
      metadata.imageType !== imageType ||
      metadata.imageUrl !== imageUrl
    ) {
      throw createImageError(
        "You cannot use this image.",
        403,
        "IMAGE_OWNERSHIP_MISMATCH"
      );
    }

    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw createImageError(
        "Uploaded image was not found.",
        400,
        "IMAGE_NOT_FOUND"
      );
    }

    throw error;
  }
}

export async function saveBrandImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw createImageError("Please select an image.");
  }
  if (file.size > MAX_MASTER_DATA_IMAGE_BYTES) {
    throw createImageError("Image must be 5 MB or smaller.", 413, "IMAGE_TOO_LARGE");
  }
  const extension = validateProductImage(file);
  const filename = `${randomUUID()}.${extension}`;
  const relativeDirectory = "brands";
  const directory = path.join(uploadRoot, relativeDirectory);
  const filePath = path.join(directory, filename);
  const url = `/uploads/master-data/${relativeDirectory}/${filename}`;
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, file.buffer, { flag: "wx" });
  return { url, path: filePath };
}

export async function saveVariantAttributeImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw createImageError("Please select an image.");
  }
  if (file.size > MAX_MASTER_DATA_IMAGE_BYTES) {
    throw createImageError("Image must be 5 MB or smaller.", 413, "IMAGE_TOO_LARGE");
  }
  const extension = validateProductImage(file);
  const filename = `${randomUUID()}.${extension}`;
  const relativeDirectory = "variant-attributes";
  const directory = path.join(uploadRoot, relativeDirectory);
  const filePath = path.join(directory, filename);
  const url = `/uploads/master-data/${relativeDirectory}/${filename}`;
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, file.buffer, { flag: "wx" });
  return { url, path: filePath };
}
export async function saveShopCategoryImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw createImageError("Please select an image.");
  }

  if (file.size > MAX_MASTER_DATA_IMAGE_BYTES) {
    throw createImageError("Image must be 5 MB or smaller.", 413, "IMAGE_TOO_LARGE");
  }

  const extension = validateProductImage(file);
  const filename = `${randomUUID()}.${extension}`;
  const relativeDirectory = "shop-categories";
  const directory = path.join(uploadRoot, relativeDirectory);
  const filePath = path.join(directory, filename);
  const url = `/uploads/master-data/${relativeDirectory}/${filename}`;

  await mkdir(directory, { recursive: true });
  await writeFile(filePath, file.buffer, { flag: "wx" });

  return { url, path: filePath };
}
export async function removeMasterDataImage(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function createImageError(
  message,
  status = 400,
  code = "INVALID_IMAGE"
) {
  return Object.assign(new Error(message), { status, code });
}
