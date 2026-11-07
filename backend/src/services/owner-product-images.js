import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";
import { isStoredProductImage, MAX_PRODUCT_IMAGES, removeProductImageFiles, saveProductImages } from "../utils/product-images.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createOwnerProductImageService(database = prisma, lookupShop = getOwnerShop, uploadDirectory) {
  return {
    upload: async (ownerId, actorId, productId, files) => {
      if (!files?.length) throw fail(400, "IMAGES_REQUIRED", "Choose at least one image to upload.");
      const shop = await lookupShop(ownerId);
      const product = await database.product.findFirst({ where: { id: productId, shopId: shop.id }, select: { id: true } });
      if (!product) throw fail(404, "PRODUCT_NOT_FOUND", "Product not found in your shop.");
      const savedFiles = await saveProductImages(files, uploadDirectory);
      try {
        return await database.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${product.id}::uuid FOR UPDATE`;
          const current = await tx.productImage.findMany({ where: { productId: product.id }, orderBy: { position: "asc" }, select: { id: true, position: true, url: true } });
          if (current.length + savedFiles.length > MAX_PRODUCT_IMAGES) throw fail(400, "TOO_MANY_PRODUCT_IMAGES", `A product can have at most ${MAX_PRODUCT_IMAGES} images.`);
          await tx.productImage.createMany({ data: savedFiles.map(({ url }, index) => ({ productId: product.id, url, position: current.length + index })) });
          await tx.auditLog.create({ data: { actorId, action: "PRODUCT_IMAGES_UPLOADED", targetType: "PRODUCT", targetId: product.id, metadata: { imageCount: savedFiles.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0) } } });
          return tx.productImage.findMany({ where: { productId: product.id }, orderBy: { position: "asc" } });
        });
      } catch (error) {
        try { await removeProductImageFiles(savedFiles.map(({ path: filePath }) => filePath)); }
        catch (cleanupError) { console.error("Could not clean up product image files after the upload transaction failed.", cleanupError); }
        throw error;
      }
    },
    remove: async (ownerId, actorId, productId, imageId) => {
      const shop = await lookupShop(ownerId);
      const image = await database.productImage.findFirst({ where: { id: imageId, productId, product: { shopId: shop.id } }, select: { id: true, productId: true, url: true } });
      if (!image) throw fail(404, "PRODUCT_IMAGE_NOT_FOUND", "Image not found on a product in your shop.");
      await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${image.productId}::uuid FOR UPDATE`;
        await tx.productImage.delete({ where: { id: image.id } });
        const remaining = await tx.productImage.findMany({ where: { productId: image.productId }, orderBy: { position: "asc" }, select: { id: true } });
        for (let position = 0; position < remaining.length; position += 1) await tx.productImage.update({ where: { id: remaining[position].id }, data: { position } });
        await tx.auditLog.create({ data: { actorId, action: "PRODUCT_IMAGE_DELETED", targetType: "PRODUCT", targetId: image.productId, metadata: { imageId: image.id } } });
      });
      if (isStoredProductImage(image.url)) await removeProductImageFiles([path.join(uploadDirectory, image.url.slice("/uploads/products/".length))]);
    }
  };
}

export const ownerProductImageService = createOwnerProductImageService(prisma, getOwnerShop, fileURLToPath(new URL("../../uploads/products/", import.meta.url)));
