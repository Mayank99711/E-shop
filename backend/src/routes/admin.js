import { listAdminCoupons } from "../services/coupons.js";
import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { env } from "../config/env.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";
import { adminDashboard } from "../controllers/admin-dashboard.js";
import { adminController } from "../controllers/admin.js";
import { adminOperationsService } from "../services/admin-operations.js";
import { customerRazorpayService } from "../services/customer-razorpay.js";
import { ensureEmailConfigured, sendEmail } from "../services/email.js";
import { adminWholesalerService } from "../services/admin-wholesalers.js";
import { shopBusinessFields } from "../validators/shop-profile.js";
import { saveMasterDataImage, saveShopCategoryImage, saveBrandImage, saveVariantAttributeImage } from "../utils/master-data-images.js";

const router = Router();
function parseUuid(value, label) {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    const error = new Error(`Invalid ${label} identifier.`);
    error.status = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  return parsed.data;
}
const normalizeName = (value) => value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
const pageLimitSchema = z.coerce.number().int().min(1).max(100).default(50);
const commissionPercentageSchema = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? null : value),
  z.coerce.number().min(0).max(100).nullable().optional()
).refine(
  (value) => value === undefined || value === null || Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
  "Commission must have at most two decimal places."
);
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
  businessAddress: z.string().trim().min(2).max(500).optional(),
  commissionPercentage: commissionPercentageSchema
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
router.use(requireAuth, requireRole("SUPER_ADMIN"));
router.get('/coupons', async(req,res,next)=>{try{res.json({items:await listAdminCoupons()});}catch(e){next(e);}});


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



router.get("/dashboard", adminDashboard);
router.get("/employees", async (_request, response, next) => {
  try {
    response.json({ items: await adminOperationsService.employees() });
  } catch (error) {
    next(error);
  }
});
router.get("/commissions", async (_request, response, next) => {
  try {
    response.json({ items: await adminOperationsService.commissions() });
  } catch (error) {
    next(error);
  }
});
router.get("/orders", async (_request, response, next) => {
  try {
    response.json({ items: await adminOperationsService.orders() });
  } catch (error) {
    next(error);
  }
});
router.post("/orders/:orderId/razorpay/reconcile", async (request, response, next) => {
  try {
    const orderId = parseUuid(request.params.orderId, "order");
    response.json(await customerRazorpayService.reconcileTestPayment(orderId, request.authUser.id));
  } catch (error) {
    next(error);
  }
});
router.get("/products", async (_request, response, next) => {
  try {
    response.json({ items: await adminOperationsService.products() });
  } catch (error) {
    next(error);
  }
});
router.patch("/products/:productId/status", parseBody(z.object({
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
})), async (request, response, next) => {
  try {
    const productId = parseUuid(request.params.productId, "product");
    const product = await adminOperationsService.setProductStatus(productId, request.authUser.id, request.validatedBody.status);
    response.json({ product });
  } catch (error) {
    next(error);
  }
});
router.get("/audit-logs", async (_request, response, next) => {
  try {
    response.json({ items: await adminOperationsService.auditLogs() });
  } catch (error) {
    next(error);
  }
});

router.get("/account-deletion-requests", pageParameters, adminController.adminAccountDeletionRequests_1);

router.patch("/account-deletion-requests/:requestId", parseBody(z.object({
  status: z.enum(["ACKNOWLEDGED", "REJECTED"]),
  reason: z.string().trim().min(2).max(500).optional()
}).refine((value) => value.status !== "REJECTED" || Boolean(value.reason), {
  message: "A reason is required when rejecting a request.",
  path: ["reason"]
})), adminController.adminAccountDeletionRequestsRequestId_2);

router.get("/shops", pageParameters, adminController.adminShops_3);

router.post("/shops", parseBody(createShopSchema), adminController.adminShops_4);

router.post("/shops/:shopId/resend-activation", adminController.adminShopsShopIdResendActivation_5);

router.patch("/shops/:shopId/status", parseBody(z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"])
})), adminController.adminShopsShopIdStatus_6);

router.patch("/shops/:shopId", parseBody(z.object({
  name: z.string().trim().min(2).max(120),
  categoryId: z.string().uuid().nullable().optional(),
  shopCategoryId: z.string().uuid().nullable().optional(),
  commissionPercentage: commissionPercentageSchema,
  ...shopBusinessFields
})), adminController.adminShopsShopId_7);

router.get("/categories", adminController.adminCategories_list);

router.post("/categories", parseBody(z.object({
  name: z.string().trim().min(2).max(100),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  iconUrl: z.string().startsWith("/uploads/").max(2048).optional().nullable(),
  imageUrl: z.string().startsWith("/uploads/").max(2048).optional().nullable()
})), adminController.adminCategories_8);

const receiveShopCategoryImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 }
}).single("image");

router.post("/shop-category-images", (request, response, next) => {
  receiveShopCategoryImage(request, response, (error) => {
    if (error) {
      next(error);
      return;
    }
    next();
  });
}, async (request, response, next) => {
  try {
    if (!request.file) {
      throw createError(400, "IMAGE_REQUIRED", "Please select an image.");
    }
    const saved = await saveShopCategoryImage(request.file);
    response.status(201).json({ success: true, data: { imageUrl: saved.url } });
  } catch (error) {
    next(error);
  }
});

const receiveAdminCategoryImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 }
}).single("image");

function parseAdminCategoryImageUpload(request, response, next) {
  receiveAdminCategoryImage(request, response, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      const uploadError = new Error(
        tooLarge
          ? "Image must be 5 MB or smaller."
          : "Upload one image using the image field."
      );
      uploadError.status = tooLarge ? 413 : 400;
      uploadError.code = tooLarge ? "IMAGE_TOO_LARGE" : "UPLOAD_LIMIT_EXCEEDED";
      next(uploadError);
      return;
    }
    next(error);
  });
}

router.post("/category-images/:imageType", parseAdminCategoryImageUpload, async (request, response, next) => {
  try {
    const allowedTypes = ["categoryIcon", "categoryImage"];
    if (!allowedTypes.includes(request.params.imageType)) {
      throw createError(400, "INVALID_IMAGE_TYPE", "Invalid image type.");
    }
    if (!request.file) {
      throw createError(400, "IMAGE_REQUIRED", "Please select an image.");
    }
    const saved = await saveMasterDataImage(request.file, request.params.imageType, request.authUser.id, request.authUser.id);
    response.status(201).json({ success: true, data: { imageUrl: saved.url, imageType: request.params.imageType } });
  } catch (error) {
    next(error);
  }
});

router.patch("/categories/:categoryId/status", parseBody(z.object({ isActive: z.boolean() })), adminController.adminCategoriesCategoryIdStatus_9);

router.patch("/categories/:categoryId", parseBody(z.object({
  name: z.string().trim().min(2).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  iconUrl: z.string().startsWith("/uploads/").max(2048).nullable().optional(),
  imageUrl: z.string().startsWith("/uploads/").max(2048).nullable().optional()
}).refine((value) => Object.keys(value).length > 0, "Provide a category name or parent.")), adminController.adminCategoriesCategoryId_10);

const shopCategoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).optional().nullable(),
  imageUrl: z.string().startsWith("/uploads/").max(2048).optional().nullable(),
  isActive: z.boolean().optional()
});

const shopCategoryUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.string().startsWith("/uploads/").max(2048).nullable().optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "Provide a shop category field to update.");

router.get("/shop-categories", async (request, response, next) => {
  try {
    const items = await prisma.shopCategory.findMany({ orderBy: { name: "asc" } });
    response.json({ items });
  } catch (error) { next(error); }
});

router.post("/shop-categories", parseBody(shopCategoryCreateSchema), async (request, response, next) => {
  try {
    const { name, description, imageUrl, isActive } = request.validatedBody;
    const normalizedName = normalizeName(name);
    const existing = await prisma.shopCategory.findUnique({ where: { normalizedName } });
    if (existing) throw createError(409, "SHOP_CATEGORY_EXISTS", "A shop category with this name already exists.");
    const shopCategory = await prisma.$transaction(async (transaction) => {
      const created = await transaction.shopCategory.create({
        data: { name, normalizedName, description: description ?? null, imageUrl: imageUrl ?? null, isActive: isActive ?? true }
      });
      await transaction.auditLog.create({
        data: { actorId: request.authUser.id, action: "SHOP_CATEGORY_CREATED", targetType: "SHOP_CATEGORY", targetId: created.id }
      });
      return created;
    });
    response.status(201).json({ shopCategory });
  } catch (error) { next(error); }
});

router.patch("/shop-categories/:shopCategoryId", parseBody(shopCategoryUpdateSchema), async (request, response, next) => {
  try {
    const id = parseUuid(request.params.shopCategoryId, "shop category");
    const data = { ...request.validatedBody };
    if (data.name) data.normalizedName = normalizeName(data.name);
    const shopCategory = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.shopCategory.update({ where: { id }, data });
      await transaction.auditLog.create({
        data: { actorId: request.authUser.id, action: "SHOP_CATEGORY_UPDATED", targetType: "SHOP_CATEGORY", targetId: id, metadata: { fields: Object.keys(request.validatedBody) } }
      });
      return updated;
    });
    response.json({ shopCategory });
  } catch (error) { next(error); }
});

router.patch("/shop-categories/:shopCategoryId/status", parseBody(z.object({ isActive: z.boolean() })), async (request, response, next) => {
  try {
    const id = parseUuid(request.params.shopCategoryId, "shop category");
    const shopCategory = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.shopCategory.update({ where: { id }, data: { isActive: request.validatedBody.isActive } });
      await transaction.auditLog.create({
        data: { actorId: request.authUser.id, action: "SHOP_CATEGORY_STATUS_CHANGED", targetType: "SHOP_CATEGORY", targetId: id, metadata: { isActive: updated.isActive } }
      });
      return updated;
    });
    response.json({ shopCategory });
  } catch (error) { next(error); }
});

const receiveBrandImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }).single("image");
const receiveVariantAttributeImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }).single("image");

router.post("/brand-images", (request, response, next) => {
  receiveBrandImage(request, response, (error) => { if (error) { next(error); return; } next(); });
}, async (request, response, next) => {
  try {
    if (!request.file) throw createError(400, "IMAGE_REQUIRED", "Please select an image.");
    const saved = await saveBrandImage(request.file);
    response.status(201).json({ success: true, data: { imageUrl: saved.url } });
  } catch (error) { next(error); }
});

router.post("/variant-attribute-images", (request, response, next) => {
  receiveVariantAttributeImage(request, response, (error) => { if (error) { next(error); return; } next(); });
}, async (request, response, next) => {
  try {
    if (!request.file) throw createError(400, "IMAGE_REQUIRED", "Please select an image.");
    const saved = await saveVariantAttributeImage(request.file);
    response.status(201).json({ success: true, data: { imageUrl: saved.url } });
  } catch (error) { next(error); }
});

router.get("/brands", adminController.adminBrands_list);

router.post("/brands", parseBody(z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).optional().nullable(),
  logoUrl: z.string().startsWith("/uploads/").max(2048).optional().nullable(),
  imageUrl: z.string().startsWith("/uploads/").max(2048).optional().nullable()
})), adminController.adminBrands_11);

router.patch("/brands/:brandId", parseBody(z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  logoUrl: z.string().startsWith("/uploads/").max(2048).nullable().optional(),
  imageUrl: z.string().startsWith("/uploads/").max(2048).nullable().optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "Provide a brand field to update.")), adminController.adminBrandsBrandId_12);

router.get("/variant-attributes", adminController.adminVariantAttributes_list);

router.post("/variant-attributes", parseBody(z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional().nullable(),
  imageUrl: z.string().startsWith("/uploads/").max(2048).optional().nullable()
})), adminController.adminVariantAttributes_13);

router.post("/variant-attributes/:attributeId/values", parseBody(z.object({ value: z.string().trim().min(1).max(80) })), adminController.adminVariantAttributesAttributeIdValues_14);

router.patch("/variant-attributes/:attributeId", parseBody(z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.string().startsWith("/uploads/").max(2048).nullable().optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "Provide an attribute field to update.")), adminController.adminVariantAttributesAttributeId_15);

router.patch("/variant-attributes/:attributeId/values/:valueId", parseBody(z.object({
  value: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "Provide a value or status.")), adminController.adminVariantAttributesAttributeIdValuesValueId_16);

router.get("/master-data-requests", pageParameters, adminController.adminMasterDataRequests_17);

router.patch("/master-data-requests/:requestId", parseBody(z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().trim().min(3).max(500).optional()
})), adminController.adminMasterDataRequestsRequestId_18);

const wholesalerCreateSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()).optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE")
});

const wholesalerUpdateSchema = z.object({
  code: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  contactName: z.string().trim().min(2).max(100).nullable().optional(),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()).nullable().optional(),
  phone: z.string().trim().min(7).max(20).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional()
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

router.get("/wholesalers", pageParameters, async (request, response, next) => {
  try {
    const { limit, cursor } = request.page;
    const result = await adminWholesalerService.list({ search: request.query.search, status: request.query.status, limit, cursor });
    response.json(result);
  } catch (error) { next(error); }
});

router.get("/wholesalers/:wholesalerId", async (request, response, next) => {
  try {
    const id = parseUuid(request.params.wholesalerId, "wholesaler");
    response.json({ wholesaler: await adminWholesalerService.get(id) });
  } catch (error) { next(error); }
});

router.post("/wholesalers", parseBody(wholesalerCreateSchema), async (request, response, next) => {
  try {
    const wholesaler = await adminWholesalerService.create(request.validatedBody);
    response.status(201).json({ wholesaler });
  } catch (error) { next(error); }
});

router.patch("/wholesalers/:wholesalerId", parseBody(wholesalerUpdateSchema), async (request, response, next) => {
  try {
    const id = parseUuid(request.params.wholesalerId, "wholesaler");
    const wholesaler = await adminWholesalerService.update(id, request.validatedBody);
    response.json({ wholesaler });
  } catch (error) { next(error); }
});

router.get("/shops/:shopId/wholesalers", async (request, response, next) => {
  try {
    const shopId = parseUuid(request.params.shopId, "shop");
    const authorizations = await adminWholesalerService.listShopWholesalers(shopId);
    response.json({ items: authorizations });
  } catch (error) { next(error); }
});

router.post("/shops/:shopId/wholesalers", parseBody(z.object({ wholesalerId: z.string().uuid() })), async (request, response, next) => {
  try {
    const shopId = parseUuid(request.params.shopId, "shop");
    const authorization = await adminWholesalerService.assignShopWholesaler(shopId, request.validatedBody.wholesalerId);
    response.status(201).json({ authorization });
  } catch (error) { next(error); }
});

router.delete("/shops/:shopId/wholesalers/:wholesalerId", async (request, response, next) => {
  try {
    const shopId = parseUuid(request.params.shopId, "shop");
    const wholesalerId = parseUuid(request.params.wholesalerId, "wholesaler");
    const result = await adminWholesalerService.revokeShopWholesaler(shopId, wholesalerId);
    response.json(result);
  } catch (error) { next(error); }
});

export default router;
