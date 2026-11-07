import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createOwnerWholesalerService(database = prisma, lookupShop = getOwnerShop) {
  return {
    registerForShop: async (ownerId, actorId, data) => {
      const shop = await lookupShop(ownerId);
      if (shop.status !== "ACTIVE") throw fail(409, "SHOP_NOT_ACTIVE", "Your shop must be active.");
      const code = data.code.trim();
      const existing = await database.wholesaler.findUnique({ where: { code }, select: { id: true } });
      if (existing) throw fail(409, "WHOLESALER_CODE_EXISTS", "This wholesaler code already exists. Ask the administrator to authorize the existing record instead.");
      try {
        return await database.$transaction(async (tx) => {
          const wholesaler = await tx.wholesaler.create({ data: {
            code, name: data.name.trim(), contactName: data.contactName || null,
            email: data.email || null, phone: data.phone || null, status: "ACTIVE"
          }});
          await tx.shopWholesaler.create({ data: { shopId: shop.id, wholesalerId: wholesaler.id, isActive: true } });
          await tx.auditLog.create({ data: {
            actorId, action: "SHOP_OWNER_WHOLESALER_REGISTERED", targetType: "WHOLESALER",
            targetId: wholesaler.id, metadata: { shopId: shop.id, code: wholesaler.code }
          }});
          return wholesaler;
        });
      } catch(error) {
        if (error.code === "P2002") throw fail(409, "WHOLESALER_CODE_EXISTS", "This wholesaler code already exists.");
        throw error;
      }
    },
    listAuthorized: async (ownerId) => {
      const shop = await lookupShop(ownerId);
      const rows = await database.shopWholesaler.findMany({
        where: { shopId: shop.id, isActive: true },
        orderBy: { createdAt: "desc" },
        include: { wholesaler: { select: { id: true, code: true, name: true, contactName: true, email: true, phone: true, status: true } } }
      });
      return rows
        .filter((row) => row.wholesaler && row.wholesaler.status === "ACTIVE")
        .map((row) => row.wholesaler);
    }
  };
}

export const ownerWholesalerService = createOwnerWholesalerService();
