import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../config/database.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

function generatedCode(prefix) {
  return `${prefix}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createAdminShopService(database = prisma) {
  return {
    setStatus: async (shopId, actorId, status) => {
      const current = await database.shop.findUnique({
        where: { id: shopId },
        select: { id: true, ownerId: true, status: true, archivedAt: true }
      });
      if (!current) throw fail(404, "SHOP_NOT_FOUND", "Shop not found.");
      return database.$transaction(async (transaction) => {
        const updatedShop = await transaction.shop.update({
          where: { id: current.id },
          data: {
            status,
            ...(status === "ARCHIVED" && !current.archivedAt ? { archivedAt: new Date() } : {})
          }
        });
        await transaction.user.update({
          where: { id: current.ownerId },
          data: { sessionVersion: { increment: 1 } }
        });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: "SHOP_STATUS_CHANGED",
            targetType: "SHOP",
            targetId: current.id,
            metadata: { previousStatus: current.status, status }
          }
        });
        return updatedShop;
      });
    },
    create: async (actorId, data) => {
      const {
        shopName,
        ownerName: providedOwnerName,
        ownerFirstName,
        ownerLastName,
        ownerEmail,
        ownerMobile,
        shopCategoryId,
        commissionPercentage,
        status,
        ...businessDetails
      } = data;
      const ownerName = providedOwnerName || `${ownerFirstName} ${ownerLastName}`;
      const existing = await database.user.findUnique({ where: { email: ownerEmail }, select: { id: true } });
      if (existing) throw fail(409, "EMAIL_IN_USE", "An account with that email already exists.");
      if (shopCategoryId && !await database.shopCategory.findFirst({ where: { id: shopCategoryId, isActive: true }, select: { id: true } })) {
        throw fail(400, "INVALID_SHOP_CATEGORY", "Choose an active shop category.");
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const created = await database.$transaction(async (transaction) => {
        const owner = await transaction.user.create({
          data: {
            role: "SHOP_OWNER",
            ownerCode: generatedCode("OWN"),
            name: ownerName,
            email: ownerEmail,
            mobile: ownerMobile,
            isActive: false
          },
          select: { id: true, ownerCode: true, name: true, email: true }
        });
        const shop = await transaction.shop.create({
          data: { code: generatedCode("SHOP"), name: shopName, ownerId: owner.id, status, ...(shopCategoryId ? { shopCategoryId } : {}), ...(commissionPercentage !== undefined ? { commissionPercentage } : {}), ...businessDetails },
          select: { id: true, code: true, name: true, status: true }
        });
        await transaction.ownerActivationToken.create({
          data: { userId: owner.id, tokenHash: hashToken(token), expiresAt }
        });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: "SHOP_CREATED",
            targetType: "SHOP",
            targetId: shop.id,
            metadata: { shopCode: shop.code, ownerId: owner.id, status }
          }
        });
        return { owner, shop };
      });
      return { ...created, token };
    },
    update: async (shopId, actorId, data) => {
      const current = await database.shop.findUnique({
        where: { id: shopId },
        select: { id: true, categoryId: true, shopCategoryId: true }
      });
      if (!current) throw fail(404, "SHOP_NOT_FOUND", "Shop not found.");
      const { categoryId, shopCategoryId } = data;
      if (categoryId && categoryId !== current.categoryId && !await database.category.findFirst({ where: { id: categoryId, isActive: true }, select: { id: true } })) {
        throw fail(400, "INVALID_SHOP_CATEGORY", "Choose an active shop category.");
      }
      if (shopCategoryId && shopCategoryId !== current.shopCategoryId && !await database.shopCategory.findFirst({ where: { id: shopCategoryId, isActive: true }, select: { id: true } })) {
        throw fail(400, "INVALID_SHOP_CATEGORY", "Choose an active shop category.");
      }
      return database.$transaction(async (transaction) => {
        const updated = await transaction.shop.update({
          where: { id: shopId },
          data
        });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: "SHOP_UPDATED",
            targetType: "SHOP",
            targetId: shopId,
            metadata: {
              name: updated.name,
              businessProfileFieldsUpdated: Object.keys(data).filter((field) => field !== "name")
            }
          }
        });
        return updated;
      });
    }
  };
}

export const adminShopService = createAdminShopService();
