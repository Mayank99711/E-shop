import { verifyCategoryVariantOptions } from "./variant-category-policy.js";
import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";
import { createProductVariants } from "./owner-product-variants.js";
import { isStoredProductImage } from "../utils/product-images.js";

const fail = (status, code, message) =>
  Object.assign(new Error(message), { status, code });

export function createOwnerProductService(
  database = prisma,
  lookupShop = getOwnerShop,
) {
  return {
    list: async (ownerId) => {
      const shop = await lookupShop(ownerId);
      return database.product.findMany({
        where: { shopId: shop.id },
        orderBy: { updatedAt: "desc" },
        include: {
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          images: { orderBy: { position: "asc" } },
          variants: {
            orderBy: { sku: "asc" },
            include: {
              values: {
                include: {
                  attribute: {
                    select: {
                      name: true,
                    },
                  },
                  value: {
                    select: {
                      id: true,
                      value: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    },
    create: async (ownerId, actorId, data) => {
      const shop = await lookupShop(ownerId);
      const {
        name,
        description,
        specifications,
        categoryId,
        brandId,
        images = [],
        variants,
        hsnCode,
        gstRate,
        taxInclusive,
        masterSku,
        shortDescription,
        basePrice,
        commissionPercent,
      } = data;
      const [category, brand] = await Promise.all([
        database.category.findFirst({
          where: { id: categoryId, isActive: true },
          select: { id: true },
        }),
        brandId
          ? database.brand.findFirst({
              where: { id: brandId, isActive: true },
              select: { id: true },
            })
          : null,
      ]);
      if (!category)
        throw fail(400, "INVALID_CATEGORY", "Choose an active category.");
      if (brandId && !brand)
        throw fail(400, "INVALID_BRAND", "Choose an active brand.");
      await verifyCategoryVariantOptions(database, categoryId, variants);
      return database.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            shopId: shop.id,
            name,
            description,
            ...(specifications !== undefined ? { specifications } : {}),
            categoryId,
            brandId: brandId ?? null,

            masterSku: masterSku?.trim() || null,
            shortDescription: shortDescription?.trim() || null,
            basePrice: basePrice ?? null,
            commissionPercent: commissionPercent ?? null,

            status: "ACTIVE",
            hsnCode: hsnCode ?? null,
            gstRate: gstRate ?? null,
            taxInclusive: taxInclusive ?? false,

            images: {
              create: images.map((url, position) => ({
                url,
                position,
              })),
            },
          },
          include: { images: { orderBy: { position: "asc" } } },
        });
        const createdVariants = await createProductVariants(
          tx,
          shop.id,
          product.id,
          variants,
        );
        await tx.auditLog.create({
          data: {
            actorId,
            action: "PRODUCT_CREATED",
            targetType: "PRODUCT",
            targetId: product.id,
            metadata: { variantCount: createdVariants.length },
          },
        });
        return { ...product, variants: createdVariants };
      });
    },
    addVariants: async (ownerId, actorId, productId, variants) => {
      const shop = await lookupShop(ownerId);
      const product = await database.product.findFirst({
        where: { id: productId, shopId: shop.id },
        select: { id: true, categoryId: true },
      });
      if (!product)
        throw fail(404, "PRODUCT_NOT_FOUND", "Product not found in your shop.");
      await verifyCategoryVariantOptions(database, product.categoryId, variants);
      return database.$transaction(async (tx) => {
        const created = await createProductVariants(
          tx,
          shop.id,
          product.id,
          variants,
        );
        await tx.auditLog.create({
          data: {
            actorId,
            action: "PRODUCT_VARIANTS_ADDED",
            targetType: "PRODUCT",
            targetId: product.id,
            metadata: { variantCount: created.length },
          },
        });
        return created;
      });
    },
    setStatus: async (ownerId, actorId, productId, status) => {
      const shop = await lookupShop(ownerId);
      const product = await database.product.findFirst({
        where: { id: productId, shopId: shop.id },
        select: { id: true },
      });
      if (!product)
        throw fail(404, "PRODUCT_NOT_FOUND", "Product not found in your shop.");
      return database.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id: product.id },
          data: { status },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "PRODUCT_STATUS_CHANGED",
            targetType: "PRODUCT",
            targetId: product.id,
            metadata: { status: updated.status },
          },
        });
        return updated;
      });
    },
    update: async (ownerId, actorId, productId, data) => {
      const shop = await lookupShop(ownerId);
      const product = await database.product.findFirst({
        where: { id: productId, shopId: shop.id },
        select: { id: true },
      });
      if (!product)
        throw fail(404, "PRODUCT_NOT_FOUND", "Product not found in your shop.");
      const { images, ...productData } = data;
      if (
        productData.categoryId &&
        !(await database.category.findFirst({
          where: { id: productData.categoryId, isActive: true },
          select: { id: true },
        }))
      ) {
        throw fail(400, "INVALID_CATEGORY", "Choose an active category.");
      }
      if (productData.categoryId) {
        const currentVariants = await database.productVariant.findMany({
          where: { productId: product.id },
          select: { values: { select: { attributeId: true } } },
        });
        await verifyCategoryVariantOptions(database, productData.categoryId, currentVariants);
      }
      if (
        productData.brandId &&
        !(await database.brand.findFirst({
          where: { id: productData.brandId, isActive: true },
          select: { id: true },
        }))
      ) {
        throw fail(400, "INVALID_BRAND", "Choose an active brand.");
      }
      return database.$transaction(async (transaction) => {
        if (images !== undefined) {
          await transaction.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${product.id}::uuid FOR UPDATE`;
        }
        const result = await transaction.product.update({
          where: { id: product.id },
          data: productData,
          include: {
            category: true,
            brand: true,
            images: { orderBy: { position: "asc" } },
          },
        });
        if (images !== undefined) {
          const existingImages = await transaction.productImage.findMany({
            where: { productId: product.id },
            select: { id: true, url: true },
          });
          const storedImages = existingImages.filter(({ url }) =>
            isStoredProductImage(url),
          );
          const externalImageIds = existingImages
            .filter(({ url }) => !isStoredProductImage(url))
            .map(({ id }) => id);
          if (externalImageIds.length) {
            await transaction.productImage.deleteMany({
              where: { id: { in: externalImageIds } },
            });
          }
          if (images.length) {
            await transaction.productImage.createMany({
              data: images.map((url, position) => ({
                productId: product.id,
                url,
                position,
              })),
            });
          }
          for (
            let position = 0;
            position < storedImages.length;
            position += 1
          ) {
            await transaction.productImage.update({
              where: { id: storedImages[position].id },
              data: { position: images.length + position },
            });
          }
        }
        const currentImages =
          images === undefined
            ? result.images
            : await transaction.productImage.findMany({
                where: { productId: product.id },
                orderBy: { position: "asc" },
              });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: "PRODUCT_UPDATED",
            targetType: "PRODUCT",
            targetId: product.id,
            metadata: { fields: Object.keys(data) },
          },
        });
        return { ...result, images: currentImages };
      });
    },
  };
}

export const ownerProductService = createOwnerProductService();
