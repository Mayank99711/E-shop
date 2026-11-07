import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { adminApprovalService } from "../services/admin-approvals.js";
import { adminCatalogService } from "../services/admin-catalog.js";
import { adminShopService } from "../services/admin-shops.js";
import { adminAccountRequestService } from "../services/admin-account-requests.js";
import { env } from "../config/env.js";
import { ensureEmailConfigured, sendEmail } from "../services/email.js";
import { shopBusinessFields } from "../validators/shop-profile.js";

export const createShopSchema = z.object({
  shopName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(100).optional(),
  ownerFirstName: z.string().trim().min(1).max(50).optional(),
  ownerLastName: z.string().trim().min(1).max(50).optional(),
  ownerEmail: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  shopCategoryId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "ACTIVE", "INACTIVE"]).default("PENDING"),
  ownerMobile: z.preprocess(
    (value) => typeof value === "string" ? value.trim() || undefined : value,
    z.string().min(7).max(20).optional()
  ),
  ...shopBusinessFields,
  businessAddress: z.string().trim().min(2).max(500).optional()
}).superRefine((value, context) => {
  if (!value.ownerName && !(value.ownerFirstName && value.ownerLastName)) {
    context.addIssue({ code: "custom", message: "Provide the owner's full name or both first and last names.", path: ["ownerFirstName"] });
  }
  if (value.ownerFirstName && !value.shopCategoryId) {
    context.addIssue({ code: "custom", message: "Choose an active shop category.", path: ["shopCategoryId"] });
  }
  if (value.ownerFirstName && !value.businessAddress) {
    context.addIssue({ code: "custom", message: "Shop address is required.", path: ["businessAddress"] });
  }
});


function parseBody(schema) {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      const error = new Error("Request validation failed.");
      error.status = 400;
      error.code = "VALIDATION_ERROR";
      error.details = parsed.error.issues.map(({ path, message }) => ({ field: path.join("."), message }));
      next(error);
      return;
    }
    request.validatedBody = parsed.data;
    next();
  };
}

function createError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeName(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function generatedCode(prefix) {
  return `${prefix}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function parseUuid(value, label) {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw createError(400, "VALIDATION_ERROR", `Invalid ${label} identifier.`);
  return parsed.data;
}

function pageParameters(request, response, next) {
  const parsedLimit = pageLimitSchema.safeParse(request.query.limit ?? 50);
  const parsedCursor = request.query.cursor === undefined
    ? { success: true, data: undefined }
    : z.string().uuid().safeParse(request.query.cursor);
  if (!parsedLimit.success || !parsedCursor.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid pagination parameters." } });
    return;
  }
  request.page = { limit: parsedLimit.data, cursor: parsedCursor.data };
  next();
}

function pagedResult(rows, limit) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items.at(-1).id : null };
}



export const adminController = {
adminCategories_list: async (_req, res, next) => { try { res.json({ items: await adminCatalogService.listCategories() }); } catch (error) { next(error); } },
adminBrands_list: async (_req, res, next) => { try { res.json({ items: await adminCatalogService.listBrands() }); } catch (error) { next(error); } },
adminVariantAttributes_list: async (_req, res, next) => { try { res.json({ items: await adminCatalogService.listVariantAttributes() }); } catch (error) { next(error); } },
adminAccountDeletionRequests_1: async (request, response, next) => { try { const rows = await adminAccountRequestService.list(request.page); response.json(pagedResult(rows, request.page.limit)); } catch (error) { next(error); } },
adminAccountDeletionRequestsRequestId_2: async (request, response, next) => { try { const id = parseUuid(request.params.requestId, "account deletion request"); const { status, reason } = request.validatedBody; const deletionRequest = await adminAccountRequestService.review(id, request.authUser.id, status, reason); response.json({ deletionRequest }); } catch (error) { next(error); } },
adminShops_3: async (request, response, next) => {
  try {
    const { limit, cursor } = request.page;
    const rows = await prisma.shop.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { id: true, ownerCode: true, name: true, email: true, mobile: true, isActive: true } } }
    });
    response.json(pagedResult(rows, limit));
  } catch (error) {
    next(error);
  }
},
  adminShops_4: async (request, response, next) => {
    try {
      ensureEmailConfigured();
      const created = await adminShopService.create(request.authUser.id, request.validatedBody);
      const activationLink = `${env.SHOP_OWNER_PORTAL_URL}/activate-account?token=${encodeURIComponent(created.token)}`;
      try {
        await sendEmail({
          to: created.owner.email,
          subject: "Activate your E-Shop owner account",
          text: `A shop has been created for you. Set your password using this one-time link within 48 hours: ${activationLink}`,
          html: `<p>A shop has been created for you.</p><p><a href="${activationLink}">Set your password</a></p><p>This one-time link expires in 48 hours.</p>`
        });
      } catch (error) {
        console.error("Shop owner activation email could not be delivered.", error);
        response.status(502).json({
          error: {
            code: "ACTIVATION_EMAIL_FAILED",
            message: "The shop and owner were created, but the activation email could not be delivered. Retry the invitation from the shop record.",
            details: { shopId: created.shop.id }
          }
        });
        return;
      }
      response.status(201).json({ shop: created.shop, owner: created.owner, message: "Shop created and owner activation email sent." });
    } catch (error) {
      next(error);
    }
  },adminShopsShopIdResendActivation_5: async (request, response, next) => {
  try {
    ensureEmailConfigured();
    const shopId = parseUuid(request.params.shopId, "shop");
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: { owner: { select: { id: true, email: true, isActive: true, role: true } } }
    });
    if (!shop) throw createError(404, "SHOP_NOT_FOUND", "Shop not found.");
    if (shop.owner.role !== "SHOP_OWNER" || shop.owner.isActive) {
      throw createError(409, "ACTIVATION_NOT_AVAILABLE", "This owner account does not need activation.");
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.ownerActivationToken.updateMany({
        where: { userId: shop.owner.id, usedAt: null },
        data: { usedAt: new Date() }
      }),
      prisma.ownerActivationToken.create({
        data: { userId: shop.owner.id, tokenHash: hashToken(token), expiresAt }
      }),
      prisma.auditLog.create({
        data: {
          actorId: request.authUser.id,
          action: "OWNER_ACTIVATION_RESENT",
          targetType: "SHOP",
          targetId: shop.id
        }
      })
    ]);
    const activationLink = `${env.SHOP_OWNER_PORTAL_URL}/activate-account?token=${encodeURIComponent(token)}`;
    try {
      await sendEmail({
        to: shop.owner.email,
        subject: "Activate your E-Shop owner account",
        text: `Set your password using this one-time link within 48 hours: ${activationLink}`,
        html: `<p><a href="${activationLink}">Set your password</a></p><p>This one-time link expires in 48 hours.</p>`
      });
    } catch (error) {
      console.error("Shop owner activation email could not be delivered.", error);
      throw createError(502, "ACTIVATION_EMAIL_FAILED", "A new activation link was created, but the email could not be delivered. Retry the invitation.");
    }
    response.json({ message: "A new activation link has been sent." });
  } catch (error) {
    next(error);
  }
},
  adminShopsShopIdStatus_6: async (request, response, next) => {
    try {
      const shopId = parseUuid(request.params.shopId, "shop");
      const { status } = request.validatedBody;
      const shop = await adminShopService.setStatus(shopId, request.authUser.id, status);
      response.json({ shop });
    } catch (error) {
      next(error);
    }
  },
  adminShopsShopId_7: async (request, response, next) => {
    try {
      const shopId = parseUuid(request.params.shopId, "shop");
      const shop = await adminShopService.update(shopId, request.authUser.id, request.validatedBody);
      response.json({ shop });
    } catch (error) {
      next(error);
    }
  },adminCategories_8: async (request, response, next) => {
  try {
    const { name, parentId, description, iconUrl, imageUrl } = request.validatedBody;
    if (parentId) {
      const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { id: true, isActive: true } });
      if (!parent || !parent.isActive) throw createError(400, "INVALID_PARENT", "Select an active parent category.");
    }
    const category = await prisma.$transaction(async (transaction) => {
      const created = await transaction.category.create({
        data: { name, normalizedName: normalizeName(name), parentId, ...(description ? { description } : {}), ...(iconUrl ? { iconUrl } : {}), ...(imageUrl ? { imageUrl } : {}) }
      });
      await transaction.auditLog.create({
        data: { actorId: request.authUser.id, action: "CATEGORY_CREATED", targetType: "CATEGORY", targetId: created.id }
      });
      return created;
    });
    response.status(201).json({ category });
  } catch (error) {
    next(error);
  }
},
adminCategoriesCategoryIdStatus_9: async (request, response, next) => {
  try {
    const id = parseUuid(request.params.categoryId, "category");
    const category = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.category.update({ where: { id }, data: { isActive: request.validatedBody.isActive } });
      await transaction.auditLog.create({
        data: { actorId: request.authUser.id, action: "CATEGORY_STATUS_CHANGED", targetType: "CATEGORY", targetId: id, metadata: { isActive: updated.isActive } }
      });
      return updated;
    });
    response.json({ category });
  } catch (error) {
    next(error);
  }
},
adminCategoriesCategoryId_10: async (request, response, next) => {
  try {
    const id = parseUuid(request.params.categoryId, "category");
    const { name, parentId, description, iconUrl, imageUrl } = request.validatedBody;
    const category = await prisma.$transaction(async (transaction) => {
      const current = await transaction.category.findUnique({ where: { id }, select: { id: true, name: true, parentId: true } });
      if (!current) throw createError(404, "CATEGORY_NOT_FOUND", "Category not found.");
      if (parentId && parentId !== current.parentId) {
        const parent = await transaction.category.findUnique({ where: { id: parentId }, select: { id: true, isActive: true } });
        if (!parent || !parent.isActive) throw createError(400, "INVALID_PARENT", "Select an active parent category.");
      }

      const nextParentId = parentId === undefined ? current.parentId : parentId;
      if (nextParentId) {
        const categories = await transaction.category.findMany({ select: { id: true, parentId: true } });
        const descendants = new Set([id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const candidate of categories) {
            if (candidate.parentId && descendants.has(candidate.parentId) && !descendants.has(candidate.id)) {
              descendants.add(candidate.id);
              changed = true;
            }
          }
        }
        if (descendants.has(nextParentId)) throw createError(400, "CATEGORY_CYCLE", "A category cannot be moved beneath itself or one of its descendants.");
      }

      const updated = await transaction.category.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name, normalizedName: normalizeName(name) } : {}),
          ...(parentId !== undefined ? { parentId } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(iconUrl !== undefined ? { iconUrl } : {}),
          ...(imageUrl !== undefined ? { imageUrl } : {})
        }
      });
      await transaction.auditLog.create({
        data: {
          actorId: request.authUser.id,
          action: "CATEGORY_UPDATED",
          targetType: "CATEGORY",
          targetId: id,
          metadata: { fields: Object.keys(request.validatedBody) }
        }
      });
      return updated;
    });
    response.json({ category });
  } catch (error) {
    next(error);
  }
},
adminBrands_11: async (request, response, next) => {
  try {
    const { name, description, logoUrl, imageUrl } = request.validatedBody;
    const brand = await prisma.$transaction(async (transaction) => {
      const created = await transaction.brand.create({ data: { name, normalizedName: normalizeName(name), ...(description ? { description } : {}), ...(logoUrl ? { logoUrl } : {}), ...(imageUrl ? { imageUrl } : {}) } });
      await transaction.auditLog.create({
        data: { actorId: request.authUser.id, action: "BRAND_CREATED", targetType: "BRAND", targetId: created.id }
      });
      return created;
    });
    response.status(201).json({ brand });
  } catch (error) {
    next(error);
  }
},
adminBrandsBrandId_12: async (request, response, next) => {
  try {
    const id = parseUuid(request.params.brandId, "brand");
    const data = {
      ...request.validatedBody,
      ...(request.validatedBody.name ? { normalizedName: normalizeName(request.validatedBody.name) } : {})
    };
    const brand = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.brand.update({ where: { id }, data });
      await transaction.auditLog.create({
        data: {
          actorId: request.authUser.id,
          action: "BRAND_UPDATED",
          targetType: "BRAND",
          targetId: id,
          metadata: { fields: Object.keys(request.validatedBody) }
        }
      });
      return updated;
    });
    response.json({ brand });
  } catch (error) {
    next(error);
  }
},
adminVariantAttributes_13: async (request, response, next) => {
  try {
    const { name, description, imageUrl } = request.validatedBody;
    const attribute = await prisma.$transaction(async (transaction) => {
      const created = await transaction.variantAttribute.create({ data: { name, normalizedName: normalizeName(name), ...(description ? { description } : {}), ...(imageUrl ? { imageUrl } : {}) } });
      await transaction.auditLog.create({
        data: { actorId: request.authUser.id, action: "VARIANT_ATTRIBUTE_CREATED", targetType: "VARIANT_ATTRIBUTE", targetId: created.id }
      });
      return created;
    });
    response.status(201).json({ attribute });
  } catch (error) { next(error); }
},
adminVariantAttributesAttributeIdValues_14: async (request, response, next) => {
  try {
    const attributeId = parseUuid(request.params.attributeId, "attribute");
    const { value } = request.validatedBody;
    const created = await prisma.$transaction(async (transaction) => {
      const valueRecord = await transaction.variantAttributeValue.create({
        data: { attributeId, value, normalizedValue: normalizeName(value) }
      });
      await transaction.auditLog.create({
        data: { actorId: request.authUser.id, action: "VARIANT_VALUE_CREATED", targetType: "VARIANT_VALUE", targetId: valueRecord.id }
      });
      return valueRecord;
    });
    response.status(201).json({ value: created });
  } catch (error) {
    next(error);
  }
},
adminVariantAttributesAttributeId_15: async (request, response, next) => {
  try {
    const id = parseUuid(request.params.attributeId, "attribute");
    const data = {
      ...request.validatedBody,
      ...(request.validatedBody.name ? { normalizedName: normalizeName(request.validatedBody.name) } : {})
    };
    const attribute = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.variantAttribute.update({ where: { id }, data });
      await transaction.auditLog.create({
        data: {
          actorId: request.authUser.id,
          action: "VARIANT_ATTRIBUTE_UPDATED",
          targetType: "VARIANT_ATTRIBUTE",
          targetId: id,
          metadata: { fields: Object.keys(request.validatedBody) }
        }
      });
      return updated;
    });
    response.json({ attribute });
  } catch (error) {
    next(error);
  }
},
adminVariantAttributesAttributeIdValuesValueId_16: async (request, response, next) => {
  try {
    const attributeId = parseUuid(request.params.attributeId, "attribute");
    const valueId = parseUuid(request.params.valueId, "variant value");
    const existing = await prisma.variantAttributeValue.findFirst({
      where: { id: valueId, attributeId },
      select: { id: true }
    });
    if (!existing) throw createError(404, "VARIANT_VALUE_NOT_FOUND", "Variant value not found.");
    const data = {
      ...request.validatedBody,
      ...(request.validatedBody.value ? { normalizedValue: normalizeName(request.validatedBody.value) } : {})
    };
    const value = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.variantAttributeValue.update({ where: { id: valueId }, data });
      await transaction.auditLog.create({
        data: {
          actorId: request.authUser.id,
          action: "VARIANT_VALUE_UPDATED",
          targetType: "VARIANT_VALUE",
          targetId: valueId,
          metadata: { fields: Object.keys(request.validatedBody) }
        }
      });
      return updated;
    });
    response.json({ value });
  } catch (error) {
    next(error);
  }
},
adminMasterDataRequests_17: async (request, response, next) => { try { const rows = await adminApprovalService.listRequests(request.page); response.json(pagedResult(rows, request.page.limit)); } catch (error) { next(error); } },
adminMasterDataRequestsRequestId_18: async (request, response, next) => { try { const requestId = parseUuid(request.params.requestId, "request"); const { decision, rejectionReason } = request.validatedBody; response.json(await adminApprovalService.reviewRequest(requestId, request.authUser.id, decision, rejectionReason)); } catch (error) { next(error); } }
};
