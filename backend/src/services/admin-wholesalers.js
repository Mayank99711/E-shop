import { prisma } from "../config/database.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createAdminWholesalerService(database = prisma) {
  return {
    list: async ({ search, status, limit = 50, cursor } = {}) => {
      const where = {};
      if (search) where.name = { contains: search, mode: "insensitive" };
      if (status) where.status = status;
      const rows = await database.wholesaler.findMany({
        where,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { name: "asc" },
        select: { id: true, code: true, name: true, contactName: true, email: true, phone: true, status: true, createdAt: true, updatedAt: true }
      });
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return { items, nextCursor: hasMore ? items.at(-1).id : null };
    },
    get: async (id) => {
      const wholesaler = await database.wholesaler.findUnique({
        where: { id },
        select: { id: true, code: true, name: true, contactName: true, email: true, phone: true, status: true, createdAt: true, updatedAt: true }
      });
      if (!wholesaler) throw fail(404, "WHOLESALER_NOT_FOUND", "Wholesaler not found.");
      return wholesaler;
    },
    create: async (data) => {
      const existing = await database.wholesaler.findUnique({ where: { code: data.code }, select: { id: true } });
      if (existing) throw fail(409, "DUPLICATE_WHOLESALER_CODE", "A wholesaler with that code already exists.");
      return database.wholesaler.create({
        data: {
          code: data.code,
          name: data.name,
          contactName: data.contactName,
          email: data.email,
          phone: data.phone,
          status: data.status || "ACTIVE"
        },
        select: { id: true, code: true, name: true, contactName: true, email: true, phone: true, status: true, createdAt: true, updatedAt: true }
      });
    },
    update: async (id, data) => {
      const current = await database.wholesaler.findUnique({ where: { id }, select: { id: true } });
      if (!current) throw fail(404, "WHOLESALER_NOT_FOUND", "Wholesaler not found.");
      if (data.code) {
        const existing = await database.wholesaler.findFirst({ where: { code: data.code, id: { not: id } }, select: { id: true } });
        if (existing) throw fail(409, "DUPLICATE_WHOLESALER_CODE", "A wholesaler with that code already exists.");
      }
      return database.wholesaler.update({
        where: { id },
        data: {
          ...(data.code !== undefined ? { code: data.code } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.contactName !== undefined ? { contactName: data.contactName } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.status !== undefined ? { status: data.status } : {})
        },
        select: { id: true, code: true, name: true, contactName: true, email: true, phone: true, status: true, createdAt: true, updatedAt: true }
      });
    },
    listShopWholesalers: async (shopId) => {
      const shop = await database.shop.findUnique({ where: { id: shopId }, select: { id: true } });
      if (!shop) throw fail(404, "SHOP_NOT_FOUND", "Shop not found.");
      return database.shopWholesaler.findMany({
        where: { shopId },
        orderBy: { createdAt: "desc" },
        include: { wholesaler: { select: { id: true, code: true, name: true, contactName: true, email: true, phone: true, status: true } } }
      });
    },
    assignShopWholesaler: async (shopId, wholesalerId) => {
      const shop = await database.shop.findUnique({ where: { id: shopId }, select: { id: true } });
      if (!shop) throw fail(404, "SHOP_NOT_FOUND", "Shop not found.");
      const wholesaler = await database.wholesaler.findUnique({ where: { id: wholesalerId }, select: { id: true, status: true } });
      if (!wholesaler) throw fail(404, "WHOLESALER_NOT_FOUND", "Wholesaler not found.");
      if (wholesaler.status !== "ACTIVE") throw fail(409, "WHOLESALER_INACTIVE", "Only active wholesalers can be assigned.");
      const existing = await database.shopWholesaler.findUnique({ where: { shopId_wholesalerId: { shopId, wholesalerId } }, select: { id: true, isActive: true } });
      if (existing) {
        if (existing.isActive) throw fail(409, "DUPLICATE_AUTHORIZATION", "This wholesaler is already authorized for the shop.");
        const updated = await database.shopWholesaler.update({ where: { id: existing.id }, data: { isActive: true }, include: { wholesaler: { select: { id: true, code: true, name: true, contactName: true, email: true, phone: true, status: true } } } });
        return updated;
      }
      return database.shopWholesaler.create({
        data: { shopId, wholesalerId, isActive: true },
        include: { wholesaler: { select: { id: true, code: true, name: true, contactName: true, email: true, phone: true, status: true } } }
      });
    },
    revokeShopWholesaler: async (shopId, wholesalerId) => {
      const existing = await database.shopWholesaler.findUnique({ where: { shopId_wholesalerId: { shopId, wholesalerId } }, select: { id: true, isActive: true } });
      if (!existing) throw fail(404, "AUTHORIZATION_NOT_FOUND", "Wholesaler authorization not found.");
      if (!existing.isActive) return { revoked: true };
      await database.shopWholesaler.update({ where: { id: existing.id }, data: { isActive: false } });
      return { revoked: true };
    }
  };
}

export const adminWholesalerService = createAdminWholesalerService();
