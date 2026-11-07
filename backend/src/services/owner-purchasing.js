import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

function toNumber(value) {
  return Number(value);
}

export function createOwnerPurchasingService(database = prisma, lookupShop = getOwnerShop) {
  async function authorizedWholesaler(shopId, wholesalerId) {
    const access = await database.shopWholesaler.findUnique({
      where: { shopId_wholesalerId: { shopId, wholesalerId } },
      include: { wholesaler: { select: { id: true, status: true } } }
    });
    if (!access || !access.isActive || !access.wholesaler || access.wholesaler.status !== "ACTIVE") {
      throw fail(403, "WHOLESALER_NOT_AUTHORIZED", "This wholesaler is not authorized for your shop.");
    }
    return access.wholesaler;
  }

  async function ownedVariant(shopId, variantId) {
    const variant = await database.productVariant.findFirst({
      where: { id: variantId, shopId },
      select: { id: true, productId: true, price: true }
    });
    if (!variant) throw fail(404, "VARIANT_NOT_FOUND", "Product variant not found in your shop.");
    return variant;
  }

  return {
    createPurchaseOrder: async (ownerId, actorId, data) => {
      const shop = await lookupShop(ownerId);
      if (shop.status !== "ACTIVE") throw fail(409, "SHOP_NOT_ACTIVE", "Your shop must be active before purchasing.");
      const wholesaler = await authorizedWholesaler(shop.id, data.wholesalerId);
      if (!Array.isArray(data.items) || data.items.length === 0) throw fail(400, "EMPTY_PURCHASE_ORDER", "Add at least one purchase-order line.");

      const lines = [];
      for (const item of data.items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw fail(400, "INVALID_QUANTITY", "Quantity must be a positive integer.");
        const variant = await ownedVariant(shop.id, item.productVariantId);
        const unitPrice = item.unitPrice === undefined ? toNumber(variant.price) : Number(item.unitPrice);
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw fail(400, "INVALID_PRICE", "Unit price must be greater than zero.");
        lines.push({ variantId: variant.id, quantity: item.quantity, unitPrice, lineTotal: unitPrice * item.quantity });
      }
      const totalAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0);

      return database.$transaction(async (tx) => {
        const po = await tx.purchaseOrder.create({
          data: {
            shopId: shop.id,
            wholesalerId: wholesaler.id,
            status: "SUBMITTED",
            totalAmount,
            expectedAt: data.expectedAt ? new Date(data.expectedAt) : null,
            items: {
              create: lines.map((line) => ({
                productVariantId: line.variantId,
                quantityOrdered: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal
              }))
            }
          },
          include: { items: true }
        });
        await tx.auditLog.create({
          data: { actorId, action: "PURCHASE_ORDER_CREATED", targetType: "PURCHASE_ORDER", targetId: po.id, metadata: { wholesalerId: wholesaler.id, lineCount: lines.length, totalAmount } }
        });
        return po;
      });
    },

    listPurchaseOrders: async (ownerId, { limit = 50, cursor, status } = {}) => {
      const shop = await lookupShop(ownerId);
      const where = { shopId: shop.id };
      if (status) where.status = status;
      const rows = await database.purchaseOrder.findMany({
        where,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
        include: { wholesaler: { select: { id: true, code: true, name: true, status: true } }, items: { select: { id: true, quantityOrdered: true, receivedQuantity: true } } }
      });
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return { items, nextCursor: hasMore ? items.at(-1).id : null };
    },

    getPurchaseOrder: async (ownerId, purchaseOrderId) => {
      const shop = await lookupShop(ownerId);
      const po = await database.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, shopId: shop.id },
        include: {
          wholesaler: { select: { id: true, code: true, name: true, status: true } },
          items: { include: { productVariant: { select: { id: true, sku: true, productId: true } }, receiptItems: true } },
          receipts: { include: { items: true } }
        }
      });
      if (!po) throw fail(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.");
      return po;
    },
    createGoodsReceipt: async (ownerId, actorId, purchaseOrderId, data) => {
      const shop = await lookupShop(ownerId);
      const po = await database.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, shopId: shop.id },
        include: { items: true }
      });
      if (!po) throw fail(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.");
      if (po.status === "CANCELLED") throw fail(409, "PURCHASE_ORDER_CANCELLED", "Cannot receive a cancelled purchase order.");
      if (!Array.isArray(data.items) || data.items.length === 0) throw fail(400, "EMPTY_RECEIPT", "Add at least one receipt line.");

      const itemMap = new Map(po.items.map((item) => [item.id, item]));
      const receiptLines = [];
      for (const line of data.items) {
        const poItem = itemMap.get(line.purchaseOrderItemId);
        if (!poItem) throw fail(400, "INVALID_RECEIPT_LINE", "Receipt line does not belong to this purchase order.");
        const received = Number(line.quantityReceived);
        const accepted = Number(line.quantityAccepted);
        const damaged = Number(line.quantityDamaged ?? 0);
        const missing = Number(line.quantityMissing ?? 0);
        if (!Number.isInteger(received) || received < 0) throw fail(400, "INVALID_RECEIVED_QUANTITY", "Received quantity must be a non-negative integer.");
        if (!Number.isInteger(accepted) || accepted < 0) throw fail(400, "INVALID_ACCEPTED_QUANTITY", "Accepted quantity must be a non-negative integer.");
        if (!Number.isInteger(damaged) || damaged < 0) throw fail(400, "INVALID_DAMAGED_QUANTITY", "Damaged quantity must be a non-negative integer.");
        if (!Number.isInteger(missing) || missing < 0) throw fail(400, "INVALID_MISSING_QUANTITY", "Missing quantity must be a non-negative integer.");
        if (accepted + damaged + missing > received) throw fail(400, "INVALID_RECEIPT_SPLIT", "Accepted, damaged and missing quantities cannot exceed received quantity.");
        const remaining = poItem.quantityOrdered - poItem.receivedQuantity;
        if (accepted > remaining) throw fail(400, "OVER_RECEIPT", "Accepted quantity exceeds the remaining ordered quantity.");
        receiptLines.push({ purchaseOrderItemId: poItem.id, quantityReceived: received, quantityAccepted: accepted, quantityDamaged: damaged, quantityMissing: missing });
      }

      return database.$transaction(async (tx) => {
        const receipt = await tx.goodsReceipt.create({
          data: {
            purchaseOrderId: po.id,
            shopId: shop.id,
            status: "DRAFT",
            receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
            items: { create: receiptLines }
          },
          include: { items: true }
        });
        await tx.auditLog.create({
          data: { actorId, action: "GOODS_RECEIPT_CREATED", targetType: "GOODS_RECEIPT", targetId: receipt.id, metadata: { purchaseOrderId: po.id, lineCount: receiptLines.length } }
        });
        return receipt;
      });
    },

    listGoodsReceipts: async (ownerId, purchaseOrderId) => {
      const shop = await lookupShop(ownerId);
      const where = { shopId: shop.id };
      if (purchaseOrderId) where.purchaseOrderId = purchaseOrderId;
      return database.goodsReceipt.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { items: true }
      });
    },

    getGoodsReceipt: async (ownerId, receiptId) => {
      const shop = await lookupShop(ownerId);
      const receipt = await database.goodsReceipt.findFirst({
        where: { id: receiptId, shopId: shop.id },
        include: { items: { include: { purchaseOrderItem: true } }, purchaseOrder: { select: { id: true, status: true, shopId: true } } }
      });
      if (!receipt) throw fail(404, "GOODS_RECEIPT_NOT_FOUND", "Goods receipt not found.");
      return receipt;
    },

    confirmGoodsReceipt: async (ownerId, actorId, receiptId) => {
      const shop = await lookupShop(ownerId);
      return database.$transaction(async (tx) => {
        const receipt = await tx.goodsReceipt.findFirst({
          where: { id: receiptId, shopId: shop.id },
          include: { items: { include: { purchaseOrderItem: true } }, purchaseOrder: { include: { items: true } } }
        });
        if (!receipt) throw fail(404, "GOODS_RECEIPT_NOT_FOUND", "Goods receipt not found.");
        if (receipt.status !== "DRAFT") throw fail(409, "RECEIPT_ALREADY_CONFIRMED", "This receipt has already been processed.");

        const consumed = await tx.goodsReceipt.updateMany({
          where: { id: receipt.id, status: "DRAFT" },
          data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: actorId }
        });
        if (consumed.count !== 1) throw fail(409, "RECEIPT_ALREADY_CONFIRMED", "This receipt has already been processed.");

        for (const item of receipt.items) {
          const poItem = item.purchaseOrderItem;
          const accepted = item.quantityAccepted;
          if (accepted <= 0) continue;
          const remaining = poItem.quantityOrdered - poItem.receivedQuantity;
          if (accepted > remaining) throw fail(400, "OVER_RECEIPT", "Accepted quantity exceeds remaining ordered quantity.");

          await tx.purchaseOrderItem.update({
            where: { id: poItem.id },
            data: { receivedQuantity: { increment: accepted } }
          });

          try {
            await tx.inventoryMovement.create({
              data: {
                shopId: shop.id,
                productVariantId: poItem.productVariantId,
                quantity: accepted,
                reason: "PURCHASE_RECEIPT",
                referenceType: "GOODS_RECEIPT_ITEM",
                referenceId: item.id,
                actorId
              }
            });
          } catch (error) {
            if (error.code === "P2002") throw fail(409, "RECEIPT_ALREADY_CONFIRMED", "This receipt line has already been processed.");
            throw error;
          }

          await tx.productVariant.update({
            where: { id: poItem.productVariantId },
            data: { stock: { increment: accepted } }
          });
        }

        const updatedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: receipt.purchaseOrderId } });
        const allReceived = updatedItems.every((item) => item.receivedQuantity >= item.quantityOrdered);
        const anyReceived = updatedItems.some((item) => item.receivedQuantity > 0);
        await tx.purchaseOrder.update({
          where: { id: receipt.purchaseOrderId },
          data: { status: allReceived ? "RECEIVED" : (anyReceived ? "PARTIALLY_RECEIVED" : receipt.purchaseOrder.status) }
        });

        await tx.auditLog.create({
          data: { actorId, action: "GOODS_RECEIPT_CONFIRMED", targetType: "GOODS_RECEIPT", targetId: receipt.id, metadata: { purchaseOrderId: receipt.purchaseOrderId } }
        });

        return tx.goodsReceipt.findUnique({ where: { id: receipt.id }, include: { items: true } });
      });
    }
  };
}

export const ownerPurchasingService = createOwnerPurchasingService();
