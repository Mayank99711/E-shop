import { z } from "zod";
import { prisma } from "../config/database.js";
import { verifyMasterDataImage } from "../utils/master-data-images.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const normalize = (value) => value.normalize("NFKC").trim().toLocaleLowerCase("en-US");

export function createAdminApprovalService(database = prisma, verifyImage = verifyMasterDataImage) {
  async function createApprovedRecord(tx, request) {
    const input = request.proposedData;
    if (request.type === "CATEGORY") {
      const parsed = z.object({
        name: z.string().trim().min(2).max(100),
        parentId: z.string().uuid().nullable().optional(),
        iconUrl: z.string().startsWith("/uploads/master-data/categories/icons/").optional(),
        imageUrl: z.string().startsWith("/uploads/master-data/categories/images/").optional()
      }).safeParse(input);
      if (!parsed.success) throw fail(400, "INVALID_REQUEST_DATA", "The category request data is invalid.");
      const { name, parentId, iconUrl, imageUrl } = parsed.data;
      if (parentId) {
        const parent = await tx.category.findUnique({ where: { id: parentId }, select: { id: true, isActive: true } });
        if (!parent || !parent.isActive) throw fail(400, "INVALID_PARENT", "The requested parent category is unavailable.");
      }
      if (iconUrl) await verifyImage(iconUrl, "categoryIcon", request.requesterId, request.shopId);
      if (imageUrl) await verifyImage(imageUrl, "categoryImage", request.requesterId, request.shopId);
      const normalizedName = normalize(name);
      const existing = await tx.category.findUnique({ where: { normalizedName } });
      if (existing) {
        if ((existing.parentId ?? null) !== (parentId ?? null)) throw fail(409, "MASTER_DATA_CONFLICT", "A category with this name already exists under a different parent.");
        const imageUpdates = {};
        if (iconUrl) imageUpdates.iconUrl = iconUrl;
        if (imageUrl) imageUpdates.imageUrl = imageUrl;
        if (Object.keys(imageUpdates).length) await tx.category.update({ where: { id: existing.id }, data: imageUpdates });
        return { type: "CATEGORY", id: existing.id };
      }
      return { type: "CATEGORY", id: (await tx.category.create({ data: { name, normalizedName, parentId, ...(iconUrl ? { iconUrl } : {}), ...(imageUrl ? { imageUrl } : {}) } })).id };
    }
    if (request.type === "BRAND") {
      const parsed = z.object({
        name: z.string().trim().min(2).max(100),
        logoUrl: z.string().startsWith("/uploads/master-data/brands/").optional()
      }).safeParse(input);
      if (!parsed.success) throw fail(400, "INVALID_REQUEST_DATA", "The brand request data is invalid.");
      const { name, logoUrl } = parsed.data;
      if (logoUrl) await verifyImage(logoUrl, "brandLogo", request.requesterId, request.shopId);
      const normalizedName = normalize(name);
      const existing = await tx.brand.findUnique({ where: { normalizedName } });
      if (existing) {
        if (logoUrl) await tx.brand.update({ where: { id: existing.id }, data: { logoUrl } });
        return { type: "BRAND", id: existing.id };
      }
      return { type: "BRAND", id: (await tx.brand.create({ data: { name, normalizedName, ...(logoUrl ? { logoUrl } : {}) } })).id };
    }
    if (request.type === "VARIANT_ATTRIBUTE") {
      const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(input);
      if (!parsed.success) throw fail(400, "INVALID_REQUEST_DATA", "The brand or variant attribute request data is invalid.");
      const normalizedName = normalize(parsed.data.name);
      const existing = await tx.variantAttribute.findUnique({ where: { normalizedName } });
      if (existing) return { type: "VARIANT_ATTRIBUTE", id: existing.id };
      return { type: "VARIANT_ATTRIBUTE", id: (await tx.variantAttribute.create({ data: { name: parsed.data.name, normalizedName } })).id };
    }
    const parsed = z.object({ attributeId: z.string().uuid(), value: z.string().trim().min(1).max(80) }).safeParse(input);
    if (!parsed.success) throw fail(400, "INVALID_REQUEST_DATA", "The variant value request data is invalid.");
    const { attributeId, value } = parsed.data;
    const attribute = await tx.variantAttribute.findUnique({ where: { id: attributeId }, select: { id: true, isActive: true } });
    if (!attribute || !attribute.isActive) throw fail(400, "INVALID_ATTRIBUTE", "The requested variant attribute is unavailable.");
    const normalizedValue = normalize(value);
    const existing = await tx.variantAttributeValue.findUnique({ where: { attributeId_normalizedValue: { attributeId, normalizedValue } } });
    if (existing) return { type: "VARIANT_VALUE", id: existing.id };
    return { type: "VARIANT_VALUE", id: (await tx.variantAttributeValue.create({ data: { attributeId, value, normalizedValue } })).id };
  }

  return {
    listRequests: ({ limit, cursor }) => database.masterDataRequest.findMany({
      take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: { createdAt: "desc" },
      include: { requester: { select: { id: true, name: true, email: true } }, shop: { select: { id: true, code: true, name: true } }, reviewer: { select: { id: true, name: true } } }
    }),
    reviewRequest: (requestId, reviewerId, decision, rejectionReason) => database.$transaction(async (tx) => {
      if (decision === "REJECTED" && !rejectionReason) throw fail(400, "REJECTION_REASON_REQUIRED", "Provide a reason when rejecting a request.");
      const pending = await tx.masterDataRequest.findUnique({ where: { id: requestId }, select: { id: true, type: true, proposedData: true, status: true, requesterId: true, shopId: true } });
      if (!pending) throw fail(404, "REQUEST_NOT_FOUND", "Master-data request not found.");
      if (pending.status !== "PENDING") throw fail(409, "REQUEST_ALREADY_REVIEWED", "This request has already been reviewed.");
      const approvedRecord = decision === "APPROVED" ? await createApprovedRecord(tx, pending) : null;
      const changed = await tx.masterDataRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status: decision, rejectionReason: decision === "REJECTED" ? rejectionReason : null, reviewerId, reviewedAt: new Date() }
      });
      if (changed.count !== 1) throw fail(409, "REQUEST_ALREADY_REVIEWED", "This request has already been reviewed.");
      await tx.auditLog.create({ data: { actorId: reviewerId, action: `MASTER_DATA_REQUEST_${decision}`, targetType: "MASTER_DATA_REQUEST", targetId: requestId, ...(approvedRecord ? { metadata: approvedRecord } : {}) } });
      return { decision, approvedRecord };
    })
  };
}

export const adminApprovalService = createAdminApprovalService();
