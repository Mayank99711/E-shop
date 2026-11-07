import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createOwnerInventoryService(database = prisma, lookupShop = getOwnerShop) {
  async function ownedVariant(ownerId, variantId, select) {
    const shop = await lookupShop(ownerId);
    const variant = await database.productVariant.findFirst({ where: { id: variantId, shopId: shop.id }, select });
    if (!variant) throw fail(404, "VARIANT_NOT_FOUND", "Variant not found in your shop.");
    return variant;
  }
  return {
    setStock: async (ownerId, actorId, variantId, stock) => {
      const variant = await ownedVariant(ownerId, variantId, { id: true });
      return database.$transaction(async (tx) => {
        const result = await tx.productVariant.update({ where: { id: variant.id }, data: { stock } });
        await tx.auditLog.create({ data: { actorId, action: "INVENTORY_STOCK_CHANGED", targetType: "PRODUCT_VARIANT", targetId: variant.id, metadata: { stock: result.stock } } });
        return result;
      });
    },
    updatePricing: async (ownerId, actorId, variantId, data) => {
      const variant = await ownedVariant(ownerId, variantId, { id: true, price: true, discountPrice: true });
      const finalPrice = data.price === undefined ? Number(variant.price) : Number(data.price);
      const finalDiscount = data.discountPrice === undefined ? (variant.discountPrice === null ? null : Number(variant.discountPrice)) : (data.discountPrice === null ? null : Number(data.discountPrice));
      if (finalDiscount !== null && finalDiscount >= finalPrice) throw fail(400, "INVALID_DISCOUNT_PRICE", "Discount price must be lower than the regular price.");
      return database.$transaction(async (tx) => {
        const result = await tx.productVariant.update({ where: { id: variant.id }, data });
        await tx.auditLog.create({ data: { actorId, action: "PRODUCT_VARIANT_UPDATED", targetType: "PRODUCT_VARIANT", targetId: variant.id, metadata: { fields: Object.keys(data) } } });
        return result;
      });
    }
  };
}

export const ownerInventoryService = createOwnerInventoryService();
