import {
  verifyMasterDataImage
} from "../utils/master-data-images.js";
import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const normalize = (value) => value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
function key(type, data) {
  if (type === "CATEGORY") return JSON.stringify({ name: normalize(data.name), parentId: data.parentId || null });
  if (type === "BRAND" || type === "VARIANT_ATTRIBUTE") return JSON.stringify({ name: normalize(data.name) });
  return JSON.stringify({ attributeId: data.attributeId, value: normalize(data.value) });
}

export function createOwnerCatalogRequestService(database = prisma, lookupShop = getOwnerShop) {
  async function validate(type, data) {
    if (type === "CATEGORY") {
      if (data.parentId && !await database.category.findFirst({ where: { id: data.parentId, isActive: true }, select: { id: true } })) throw fail(400, "INVALID_PARENT_CATEGORY", "Choose an active parent category.");
      if (await database.category.findUnique({ where: { normalizedName: normalize(data.name) }, select: { id: true } })) throw fail(409, "MASTER_DATA_EXISTS", "That category already exists.");
    } else if (type === "BRAND") {
      if (await database.brand.findUnique({ where: { normalizedName: normalize(data.name) }, select: { id: true } })) throw fail(409, "MASTER_DATA_EXISTS", "That brand already exists.");
    } else if (type === "VARIANT_ATTRIBUTE") {
      if (await database.variantAttribute.findUnique({ where: { normalizedName: normalize(data.name) }, select: { id: true } })) throw fail(409, "MASTER_DATA_EXISTS", "That variant attribute already exists.");
    } else {
      if (!await database.variantAttribute.findFirst({ where: { id: data.attributeId, isActive: true }, select: { id: true } })) throw fail(400, "INVALID_ATTRIBUTE", "Choose an active variant attribute.");
      if (await database.variantAttributeValue.findFirst({ where: { attributeId: data.attributeId, normalizedValue: normalize(data.value) }, select: { id: true } })) throw fail(409, "MASTER_DATA_EXISTS", "That value already exists for the selected attribute.");
    }
  }

  return {
    list: async (ownerId) => {
      const shop = await lookupShop(ownerId);

      return database.masterDataRequest.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: "desc" }, take: 100,
        select: { id: true, type: true, proposedData: true, status: true, rejectionReason: true, createdAt: true, reviewedAt: true, reviewer: { select: { name: true } } } });
    },
    submit: async (ownerId, actorId, type, proposedData) => {
      const shop = await lookupShop(ownerId);
      await validate(type, proposedData);
            if (type === "CATEGORY") {
        if (proposedData.iconUrl) {
          await verifyMasterDataImage(
            proposedData.iconUrl,
            "categoryIcon",
            ownerId,
            shop.id
          );
        }

        if (proposedData.imageUrl) {
          await verifyMasterDataImage(
            proposedData.imageUrl,
            "categoryImage",
            ownerId,
            shop.id
          );
        }
      }

      if (type === "BRAND" && proposedData.logoUrl) {
        await verifyMasterDataImage(
          proposedData.logoUrl,
          "brandLogo",
          ownerId,
          shop.id
        );
      }
      const pending = await database.masterDataRequest.findMany({ where: { shopId: shop.id, type, status: "PENDING" }, select: { proposedData: true } });
      if (pending.some(({ proposedData: current }) => key(type, current) === key(type, proposedData))) throw fail(409, "REQUEST_ALREADY_PENDING", "An identical request is already waiting for review.");
      return database.$transaction(async (tx) => {
        const created = await tx.masterDataRequest.create({ data: { type, proposedData, requesterId: actorId, shopId: shop.id } });
        await tx.auditLog.create({ data: { actorId, action: "MASTER_DATA_REQUEST_SUBMITTED", targetType: "MASTER_DATA_REQUEST", targetId: created.id, metadata: { type } } });
        return created;
      });
    }
  };
}

export const ownerCatalogRequestService = createOwnerCatalogRequestService();
