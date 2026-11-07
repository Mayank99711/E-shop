import { randomBytes as roleRandomBytes } from "node:crypto";
import {
  EMPLOYEE_PERMISSIONS,
  getRolePermissions,
} from "../config/employee-permissions.js";
import { listOwnerCoupons, createOwnerCoupon, updateOwnerCoupon, listOwnerCouponUsage } from "../services/coupons.js";
import { getOwnerShop } from "../services/owner-shop.js";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { env } from "../config/env.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";
import {
  isStoredProductImage,
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_IMAGE_BYTES,
  removeProductImageFiles,
  saveProductImages,
} from "../utils/product-images.js";
import { shopBusinessProfileSchema } from "../validators/shop-profile.js";
import { ownerShopController } from "../controllers/owner-shop.js";
import {listWholesalersForOwner,editWholesaler,changeWholesalerStatus,editPurchaseOrderDate,editBillNotes,editPaymentNotes} from "../services/owner-wholesaler-editing.js";
import { ownerWholesalerService } from "../services/owner-wholesalers.js";
import { ownerPurchasingService } from "../services/owner-purchasing.js";
import { ownerAttendancePayrollService } from "../services/owner-attendance-payroll.js";
import { ownerReportsService } from "../services/owner-reports.js";
import { ownerController } from "../controllers/owner.js";
import {
  saveMasterDataImage,
  MAX_MASTER_DATA_IMAGE_BYTES,
} from "../utils/master-data-images.js";

// Wholesale Bills
import {
  uploadWholesaleBill,
  listWholesaleBills,
  getWholesaleBillFile,
} from "../services/owner-wholesale-bills.js";

// Wholesale Payments
import {
  listWholesalePayments,
  recordWholesalePayment,
} from "../services/owner-wholesale-payments.js";

function parseUuid(value, label) {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success)
    throw createError(400, "VALIDATION_ERROR", `Invalid ${label} identifier.`);
  return parsed.data;
}
const couponInput = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{3,30}$/).transform(value => value.toUpperCase()),
  discountType: z.enum(['PERCENTAGE', 'FIXED']), discountValue: z.number().positive().max(10000000),
  minimumOrder: z.number().min(0).default(0), maxDiscount: z.number().positive().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(), perCustomerLimit: z.number().int().positive().nullable().optional(),
  startsAt: z.string().datetime(), expiresAt: z.string().datetime(), isActive: z.boolean().default(true)
}).refine(c => c.discountType !== 'PERCENTAGE' || c.discountValue <= 100, {message:'Percentage cannot exceed 100%'}).refine(c => new Date(c.expiresAt)>new Date(c.startsAt), {message:'Expiry must be after start'});
const router = Router();
router.use(requireAuth, requireRole("SHOP_OWNER"));
router.get('/coupons', async(req,res,next)=>{try {res.json({items:await listOwnerCoupons(req.authUser.id)});}catch(e){next(e);}});
router.get('/coupons/:id/usage', async(req,res,next)=>{
  try {
    const id = z.string().uuid().parse(req.params.id);
    res.json({ items: await listOwnerCouponUsage(req.authUser.id,id) });
  } catch(e) { next(e); }
});
router.post('/coupons', async(req,res,next)=>{try{const parsed=couponInput.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Invalid coupon data',details:parsed.error.issues});res.status(201).json({coupon:await createOwnerCoupon(req.authUser.id,req.authUser.id,parsed.data)});}catch(e){next(e);}});
router.patch('/coupons/:id', async(req,res,next)=>{try{const parsed=couponInput.innerType().partial().omit({code:true}).safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Invalid coupon update',details:parsed.error.issues});res.json({coupon:await updateOwnerCoupon(req.authUser.id,req.authUser.id,req.params.id,parsed.data)});}catch(e){next(e);}});

const productUploadDirectory = fileURLToPath(
  new URL("../../uploads/products/", import.meta.url),
);
const receiveProductImageFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES, files: 6, fields: 0 },
}).array("images", 6);
const receiveMasterDataImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_MASTER_DATA_IMAGE_BYTES,
    files: 1,
    fields: 0,
  },
}).single("image");
const priceSchema = z
  .string()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "Enter a valid amount with up to two decimal places.",
  );
const positiveMoneySchema = priceSchema.refine(
  (amount) => Number(amount) > 0,
  "Enter an amount greater than zero.",
);
const uuidSchema = z.string().uuid();
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid calendar date.");
const imageUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    );
  }, "Use an HTTPS image URL (HTTP is allowed only for localhost).");

function createError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function parseProductImageUpload(request, _response, next) {
  receiveProductImageFiles(request, _response, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      next(
        createError(
          tooLarge ? 413 : 400,
          tooLarge ? "IMAGE_TOO_LARGE" : "UPLOAD_LIMIT_EXCEEDED",
          tooLarge
            ? "Each image must be 5 MB or smaller."
            : "Use the images field and upload no more than six files at a time.",
        ),
      );
      return;
    }
    next(error);
  });
}
function parseMasterDataImageUpload(req, res, next) {
  receiveMasterDataImage(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";

      return next(
        createError(
          tooLarge ? 413 : 400,
          tooLarge ? "IMAGE_TOO_LARGE" : "UPLOAD_LIMIT_EXCEEDED",
          tooLarge
            ? "Image must be 5 MB or smaller."
            : "Upload one file using the image field.",
        ),
      );
    }

    next(error);
  });
}

function parseBody(schema) {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      const error = createError(
        400,
        "VALIDATION_ERROR",
        "Request validation failed.",
      );
      error.details = parsed.error.issues.map(({ path, message }) => ({
        field: path.join("."),
        message,
      }));
      next(error);
      return;
    }
    request.validatedBody = parsed.data;
    next();
  };
}

function validateIdParam(name) {
  return (request, _response, next) => {
    const parsed = uuidSchema.safeParse(request.params[name]);
    if (!parsed.success) {
      next(createError(400, "VALIDATION_ERROR", `Invalid ${name} identifier.`));
      return;
    }
    request.params[name] = parsed.data;
    next();
  };
}

const variantSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((sku) => sku.toUpperCase()),
    variantName: z.string().trim().max(120).nullable().optional(),

    wholesalePrice: priceSchema.nullable().optional(),
    markedPrice: priceSchema.nullable().optional(),

    price: priceSchema,
    discountPrice: priceSchema.nullable().optional(),

    stock: z.number().int().min(0).max(1_000_000),
    values: z
      .array(
        z.object({
          attributeId: uuidSchema,
          valueId: uuidSchema,
        }),
      )
      .max(8),
  })
  .superRefine((variant, context) => {
    if (
      variant.discountPrice &&
      Number(variant.discountPrice) >= Number(variant.price)
    ) {
      context.addIssue({
        code: "custom",
        path: ["discountPrice"],
        message: "Discount price must be lower than the regular price.",
      });
    }
    if (
      variant.wholesalePrice !== null &&
      variant.wholesalePrice !== undefined &&
      Number(variant.wholesalePrice) > Number(variant.price)
    ) {
      context.addIssue({
        code: "custom",
        path: ["wholesalePrice"],
        message: "Wholesale price cannot exceed selling price.",
      });
    }

    if (
      variant.markedPrice !== null &&
      variant.markedPrice !== undefined &&
      Number(variant.markedPrice) < Number(variant.price)
    ) {
      context.addIssue({
        code: "custom",
        path: ["markedPrice"],
        message: "Marked price cannot be lower than selling price.",
      });
    }
    const attributeIds = variant.values.map(({ attributeId }) => attributeId);
    if (new Set(attributeIds).size !== attributeIds.length) {
      context.addIssue({
        code: "custom",
        path: ["values"],
        message: "A variant can include each attribute only once.",
      });
    }
  });

const productCreateSchema = z.object({
  masterSku: z.string().trim().max(80).nullable().optional(),

  shortDescription: z.string().trim().max(1000).nullable().optional(),

  basePrice: priceSchema.nullable().optional(),

  commissionPercent: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/)
    .refine(
      (value) => Number(value) >= 0 && Number(value) <= 100,
      "Commission must be between 0 and 100.",
    )
    .nullable()
    .optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(1).max(5000),
  categoryId: uuidSchema,
  brandId: uuidSchema.nullable().optional(),
  hsnCode: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/)
    .nullable()
    .optional(),
  gstRate: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,4})?$/)
    .refine(
      (v) => Number(v) >= 0 && Number(v) <= 1,
      "Enter a GST rate between 0 and 1.",
    )
    .nullable()
    .optional(),
  taxInclusive: z.boolean().optional(),
  images: z.array(imageUrlSchema).max(10).default([]),
  variants: z.array(variantSchema).min(1).max(100),
});

router.get("/shop", ownerShopController.getProfile);

router.patch(
  "/shop",
  parseBody(
    shopBusinessProfileSchema.refine(
      (profile) => Object.values(profile).some((value) => value !== undefined),
      "Provide at least one business profile field.",
    ),
  ),
  ownerShopController.updateProfile,
);

router.get("/dashboard", ownerController.ownerDashboard_1);

router.get("/catalog-options", ownerController.ownerCatalogOptions_2);

router.get("/products", ownerController.ownerProducts_3);

router.post(
  "/products",
  parseBody(productCreateSchema),
  ownerController.ownerProducts_4,
);

router.post(
  "/products/:productId/images",
  validateIdParam("productId"),
  parseProductImageUpload,
  ownerController.ownerProductsProductIdImages_5,
);

router.delete(
  "/products/:productId/images/:imageId",
  validateIdParam("productId"),
  validateIdParam("imageId"),
  ownerController.ownerProductsProductIdImagesImageId_6,
);

router.post(
  "/products/:productId/variants",
  validateIdParam("productId"),
  parseBody(
    z.object({
      variants: z.array(variantSchema).min(1).max(100),
    }),
  ),
  ownerController.ownerProductsProductIdVariants_7,
);

router.patch(
  "/products/:productId",
  validateIdParam("productId"),
  parseBody(
    z
      .object({
        masterSku: z.string().trim().max(80).nullable().optional(),

        shortDescription: z.string().trim().max(1000).nullable().optional(),

        basePrice: priceSchema.nullable().optional(),

        commissionPercent: z
          .string()
          .regex(/^\d{1,3}(\.\d{1,2})?$/)
          .refine(
            (value) => Number(value) >= 0 && Number(value) <= 100,
            "Commission must be between 0 and 100.",
          )
          .nullable()
          .optional(),
        name: z.string().trim().min(2).max(160).optional(),
        description: z.string().trim().min(1).max(5000).optional(),
        categoryId: uuidSchema.optional(),
        brandId: uuidSchema.nullable().optional(),
        hsnCode: z
          .string()
          .trim()
          .regex(/^\d{4,8}$/)
          .nullable()
          .optional(),
        gstRate: z
          .string()
          .regex(/^\d{1,3}(\.\d{1,4})?$/)
          .refine(
            (v) => Number(v) >= 0 && Number(v) <= 1,
            "Enter a GST rate between 0 and 1.",
          )
          .nullable()
          .optional(),
        taxInclusive: z.boolean().optional(),
        images: z.array(imageUrlSchema).max(10).optional(),
      })
      .refine(
        (body) => Object.keys(body).length > 0,
        "Provide at least one product field to update.",
      ),
  ),
  ownerController.ownerProductsProductId_8,
);

router.patch(
  "/products/:productId/status",
  validateIdParam("productId"),
  parseBody(
    z.object({
      status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    }),
  ),
  ownerController.ownerProductsProductIdStatus_9,
);

router.patch(
  "/variants/:variantId/stock",
  validateIdParam("variantId"),
  parseBody(
    z.object({
      stock: z.number().int().min(0).max(1_000_000),
    }),
  ),
  ownerController.ownerVariantsVariantIdStock_10,
);

router.patch(
  "/variants/:variantId",
  validateIdParam("variantId"),
  parseBody(
    z
      .object({
        variantName: z.string().trim().max(120).nullable().optional(),

        wholesalePrice: priceSchema.nullable().optional(),

        markedPrice: priceSchema.nullable().optional(),

        price: priceSchema.optional(),

        discountPrice: priceSchema.nullable().optional(),

        stock: z.number().int().min(0).max(1_000_000).optional(),
      })
      .refine(
        (body) => Object.keys(body).length > 0,
        "Provide at least one variant field to update.",
      ),
  ),
  ownerController.ownerVariantsVariantId_11,
);

const requestDetailsSchema = {
  description: z.string().trim().max(2000).optional(),
  businessJustification: z.string().trim().max(1000).optional(),
  supportingInfo: z.string().trim().max(2000).optional(),
};
const optionalHttpUrl = z
  .string()
  .url()
  .max(2048)
  .refine(
    (value) => ["http:", "https:"].includes(new URL(value).protocol),
    "Use an HTTP or HTTPS URL.",
  )
  .optional();
const optionalMasterDataImageUrl = z
  .string()
  .regex(
    /^\/uploads\/master-data\/(?:categories\/icons|categories\/images|brands)\/[0-9a-f-]{36}\.(jpg|png|webp)$/i,
    "Use a valid uploaded master-data image URL.",
  )
  .optional();
export const masterDataRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("CATEGORY"),
    proposedData: z.object({
      name: z.string().trim().min(2).max(100),
      parentId: uuidSchema.nullable().optional(),
      iconUrl: optionalMasterDataImageUrl,
      imageUrl: optionalMasterDataImageUrl,
      ...requestDetailsSchema,
    }),
  }),
  z.object({
    type: z.literal("BRAND"),
    proposedData: z.object({
      name: z.string().trim().min(2).max(100),
      ...requestDetailsSchema,
      website: optionalHttpUrl,
      logoUrl: optionalMasterDataImageUrl,
    }),
  }),
  z.object({
    type: z.literal("VARIANT_ATTRIBUTE"),
    proposedData: z.object({
      name: z.string().trim().min(2).max(80),
      ...requestDetailsSchema,
    }),
  }),
  z.object({
    type: z.literal("VARIANT_VALUE"),
    proposedData: z.object({
      attributeId: uuidSchema,
      value: z.string().trim().min(1).max(80),
      ...requestDetailsSchema,
    }),
  }),
]);

router.get("/master-data-requests", ownerController.ownerMasterDataRequests_12);

router.post(
  "/master-data-images/:imageType",
  parseMasterDataImageUpload,
  async (req, res, next) => {
    try {
      const allowedTypes = ["categoryIcon", "categoryImage", "brandLogo"];

      if (!allowedTypes.includes(req.params.imageType)) {
        throw createError(400, "INVALID_IMAGE_TYPE", "Invalid image type.");
      }

      if (!req.file) {
        throw createError(400, "IMAGE_REQUIRED", "Please select an image.");
      }

      const shop = await getOwnerShop(req.authUser.id);

      const saved = await saveMasterDataImage(
        req.file,
        req.params.imageType,
        req.authUser.id,
        shop.id,
      );

      res.status(201).json({
        success: true,
        data: {
          imageUrl: saved.url,
          imageType: req.params.imageType,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// router.post(
//   "/master-data-requests",
//   parseBody(masterDataRequestSchema),
//   ownerController.ownerMasterDataRequests_13,
// );
router.post(
  "/master-data-requests",
  parseBody(masterDataRequestSchema),
  ownerController.ownerMasterDataRequests_13,
);

const employeeCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase())
    .nullable()
    .optional(),
  mobile: z.string().trim().min(7).max(20),
  designation: z.string().trim().min(2).max(100).optional(),
  joiningDate: dateOnlySchema,
  initialSalary: positiveMoneySchema,
});

// Inline employee roles: saved per shop and reusable in the Employee Role dropdown.
router.get("/employee-roles", async (req, res, next) => {
  try {
    const shop = await getOwnerShop(req.authUser.id);
    const roles = await prisma.shopEmployeeRole.findMany({
      where: { shopId: shop.id }, orderBy: { name: "asc" },
      select: { code: true, name: true, defaultPermissions: true },
    });
    res.json({ items: roles });
  } catch (error) { next(error); }
});

router.post("/employee-roles", parseBody(z.object({
  name: z.string().trim().min(2).max(80),
  permissions: z.array(z.enum(Object.values(EMPLOYEE_PERMISSIONS))).max(Object.keys(EMPLOYEE_PERMISSIONS).length).default([]),
}).strict()), async (req, res, next) => {
  try {
    const shop = await getOwnerShop(req.authUser.id);
    const name = req.validatedBody.name;
    const existingCustom = await prisma.shopEmployeeRole.findMany({ where: { shopId: shop.id }, select: { name: true } });
    const builtin = ["Shop Manager", "Sales Staff", "Inventory Staff", "Delivery Associate"];
    if ([...builtin, ...existingCustom.map(r => r.name)].some(r => r.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: { code: "ROLE_EXISTS", message: "This role already exists." } });
    }
    const role = await prisma.shopEmployeeRole.create({ data: {
      shopId: shop.id, name, code: `CUSTOM_${roleRandomBytes(8).toString("hex").toUpperCase()}`,
      defaultPermissions: [...new Set(req.validatedBody.permissions)],
    }, select: { code: true, name: true, defaultPermissions: true } });
    res.status(201).json({ data: role });
  } catch (error) { next(error); }
});

router.get("/employees", ownerController.ownerEmployees_14);

router.post(
  "/employees",
  parseBody(employeeCreateSchema),
  ownerController.ownerEmployees_15,
);

// Owner-only personal employee details update.
router.patch(
  "/employees/:employeeId/details",
  validateIdParam("employeeId"),
  parseBody(
    z
      .object({
        name: z.string().trim().min(2).max(100).optional(),
        email: z
          .union([z.string().trim().email().max(254), z.null()])
          .optional(),
        mobile: z.string().trim().min(7).max(20).optional(),
        designation: z.string().trim().min(2).max(100).optional(),
        joiningDate: dateOnlySchema.optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, {
        message: "No changes provided.",
      }),
  ),
  async (req, res, next) => {
    try {
      const shop = await getOwnerShop(req.authUser.id);
      const employee = await prisma.$transaction(async (tx) => {
        const existing = await tx.employee.findFirst({
          where: { id: req.params.employeeId, shopId: shop.id },
          select: { id: true, userId: true, email: true },
        });
        if (!existing) {
          const error = new Error("Employee not found in your shop.");
          error.status = 404;
          error.code = "EMPLOYEE_NOT_FOUND";
          throw error;
        }
        const input = req.validatedBody;
        if (
          existing.userId &&
          Object.prototype.hasOwnProperty.call(input, "email") &&
          input.email !== existing.email
        ) {
          const error = new Error(
            "Cannot change the email of an existing linked login account here.",
          );
          error.status = 409;
          error.code = "LINKED_EMAIL_CHANGE_BLOCKED";
          throw error;
        }
        const data = { ...input };
        if (input.joiningDate)
          data.joiningDate = new Date(input.joiningDate + "T00:00:00.000Z");
        if (typeof input.email === "string")
          data.email = input.email.toLowerCase();
        const updated = await tx.employee.update({
          where: { id: existing.id },
          data,
        });
        await tx.auditLog.create({
          data: {
            actorId: req.authUser.id,
            action: "EMPLOYEE_DETAILS_UPDATED",
            targetType: "EMPLOYEE",
            targetId: updated.id,
            metadata: { changedFields: Object.keys(input) },
          },
        });
        return updated;
      });
      res.json({ employee });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/employees/:employeeId",
  validateIdParam("employeeId"),
  parseBody(z.object({ isActive: z.boolean() })),
  ownerController.ownerEmployeesEmployeeId_16,
);

router.patch(
  "/employees/:employeeId/role",
  validateIdParam("employeeId"),
  parseBody(
    z
      .object({
        employeeRole: z.string().min(2).max(60),
      })
      .strict(),
  ),
  ownerController.assignEmployeeRole,
);

router.post(
  "/employees/:employeeId/login-account",
  validateIdParam("employeeId"),
  ownerController.createEmployeeLoginAccount,
);
router.post(
  "/employees/:employeeId/send-activation",
  validateIdParam("employeeId"),
  ownerController.sendEmployeeActivation,
);
// Get employee's current permissions (Shop Owner only)
router.get(
  "/employees/:employeeId/permissions",
  validateIdParam("employeeId"),
  async (req, res, next) => {
    try {
      const shop = await getOwnerShop(req.authUser.id);

      const employee = await prisma.employee.findFirst({
        where: {
          id: req.params.employeeId,
          shopId: shop.id,
        },
        select: {
          id: true,
          name: true,
          employeeRole: true,
          permissionOverrides: true,
        },
      });

      if (!employee) {
        return res.status(404).json({
          error: {
            code: "EMPLOYEE_NOT_FOUND",
            message: "Employee not found in your shop.",
          },
        });
      }

      const customRole = employee.employeeRole?.startsWith("CUSTOM_")
        ? await prisma.shopEmployeeRole.findFirst({ where: { code: employee.employeeRole, shopId: shop.id } }) : null;
      const roleDefaults = customRole ? customRole.defaultPermissions : getRolePermissions(employee.employeeRole);

      const permissions = Array.isArray(employee.permissionOverrides)
        ? employee.permissionOverrides
        : roleDefaults;

      return res.status(200).json({
        success: true,
        data: {
          employeeId: employee.id,
          employeeRole: employee.employeeRole,
          permissions,
          roleDefaults,
          usesCustomPermissions: Array.isArray(employee.permissionOverrides),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
// Shop Owner controls employee permissions.
router.patch(
  "/employees/:employeeId/permissions",
  validateIdParam("employeeId"),
  parseBody(
    z
      .object({
        permissions: z
          .array(z.enum(Object.values(EMPLOYEE_PERMISSIONS)))
          .max(Object.keys(EMPLOYEE_PERMISSIONS).length),
      })
      .strict(),
  ),
  async (req, res, next) => {
    try {
      const shop = await getOwnerShop(req.authUser.id);

      const employee = await prisma.employee.findFirst({
        where: {
          id: req.params.employeeId,
          shopId: shop.id,
        },
      });

      if (!employee) {
        return res.status(404).json({
          error: {
            code: "EMPLOYEE_NOT_FOUND",
            message: "Employee not found in your shop.",
          },
        });
      }

      const permissions = [...new Set(req.validatedBody.permissions)];

      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.employee.update({
          where: { id: employee.id },
          data: { permissionOverrides: permissions },
          select: {
            id: true,
            employeeRole: true,
            permissionOverrides: true,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: req.authUser.id,
            action: "EMPLOYEE_PERMISSIONS_UPDATED",
            targetType: "EMPLOYEE",
            targetId: employee.id,
            metadata: { permissions },
          },
        });

        return result;
      });

      return res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/employees/:employeeId/salary-history",
  validateIdParam("employeeId"),
  ownerController.ownerEmployeesEmployeeIdSalaryHistory_17,
);

router.post(
  "/employees/:employeeId/salary-history",
  validateIdParam("employeeId"),
  parseBody(
    z.object({
      amount: positiveMoneySchema,
      effectiveFrom: dateOnlySchema,
      note: z.string().trim().max(500).nullable().optional(),
    }),
  ),
  ownerController.ownerEmployeesEmployeeIdSalaryHistory_18,
);

const nextOrderStatus = {
  PLACED: "CONFIRMED",
  CONFIRMED: "PAYMENT_PROCESSING",
  PAYMENT_PROCESSING: "INVENTORY_ALLOCATED",
  INVENTORY_ALLOCATED: "PICKING",
  PICKING: "PACKED",
  PACKED: "SHIPPED",
  SHIPPED: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};
const orderProgression = [
  "PLACED",
  "CONFIRMED",
  "PAYMENT_PROCESSING",
  "INVENTORY_ALLOCATED",
  "PICKING",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

router.get("/orders", ownerController.ownerOrders_19);

router.get("/payments", async (request, response, next) => {
  try {
    response.json({
      items: await ownerReportsService.listPayments(request.authUser.id),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/reports", async (request, response, next) => {
  try {
    response.json(await ownerReportsService.getReports(request.authUser.id));
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/orders/:orderId/status",
  validateIdParam("orderId"),
  parseBody(
    z.object({
      status: z.enum([
        "CONFIRMED",
        "PAYMENT_PROCESSING",
        "INVENTORY_ALLOCATED",
        "PICKING",
        "PACKED",
      ]),
    }),
  ),
  ownerController.ownerOrdersOrderIdStatus_20,
);

// Shop owners may register a new supplier for their own shop only.
// Existing shared suppliers must instead be assigned by Super Admin.
const ownerWholesalerRegistrationSchema = z
  .object({
    code: z.string().trim().min(2).max(40),
    name: z.string().trim().min(2).max(120),
    contactName: z.string().trim().max(100).optional(),
    email: z.string().trim().email().max(254).optional(),
    phone: z.string().trim().min(7).max(20).optional(),
  })
  .strict();
router.post("/wholesalers", async (request, response, next) => {
  try {
    const data = ownerWholesalerRegistrationSchema.parse(request.body);
    const wholesaler = await ownerWholesalerService.registerForShop(
      request.authUser.id,
      request.authUser.id,
      data,
    );
    response.status(201).json({ wholesaler });
  } catch (error) {
    next(error);
  }
});

router.get("/wholesalers", async (request, response, next) => {
  try {
    const wholesalers = await listWholesalersForOwner(request.authUser.id);
    response.json({ items: wholesalers });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET PURCHASE ORDERS - Logged-in Shop Owner
// =====================================================
router.get("/purchase-orders", async (request, response, next) => {
  try {
    const result = await ownerPurchasingService.listPurchaseOrders(
      request.authUser.id,
      {
        limit: 50,
        cursor: request.query.cursor || undefined,
        status: request.query.status || undefined,
      },
    );

    response.json(result);
  } catch (error) {
    next(error);
  }
});

// =====================================================
// CREATE PURCHASE ORDER
// =====================================================
router.post(
  "/purchase-orders",
  parseBody(
    z.object({
      wholesalerId: z.string().uuid(),
      expectedAt: z.string().datetime().optional(),
      items: z
        .array(
          z.object({
            productVariantId: z.string().uuid(),
            quantity: z.number().int().min(1).max(10000),
            unitPrice: z
              .string()
              .regex(/^\d{1,10}(\.\d{1,2})?$/)
              .optional(),
          }),
        )
        .min(1),
    }),
  ),
  async (request, response, next) => {
    try {
      const po = await ownerPurchasingService.createPurchaseOrder(
        request.authUser.id,
        request.authUser.id,
        request.validatedBody,
      );
      response.status(201).json({ purchaseOrder: po });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/purchase-orders/:purchaseOrderId",
  validateIdParam("purchaseOrderId"),
  async (request, response, next) => {
    try {
      const purchaseOrder = await ownerPurchasingService.getPurchaseOrder(
        request.authUser.id,
        request.params.purchaseOrderId,
      );

      response.json({ purchaseOrder });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/purchase-orders/:purchaseOrderId/receipts",
  parseBody(
    z.object({
      receivedAt: z.string().datetime().optional(),
      items: z
        .array(
          z.object({
            purchaseOrderItemId: z.string().uuid(),
            quantityReceived: z.number().int().min(0),
            quantityAccepted: z.number().int().min(0),
            quantityDamaged: z.number().int().min(0).optional(),
            quantityMissing: z.number().int().min(0).optional(),
          }),
        )
        .min(1),
    }),
  ),
  async (request, response, next) => {
    try {
      const id = parseUuid(request.params.purchaseOrderId, "purchase order");
      const receipt = await ownerPurchasingService.createGoodsReceipt(
        request.authUser.id,
        request.authUser.id,
        id,
        request.validatedBody,
      );
      response.status(201).json({ receipt });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/purchase-orders/:purchaseOrderId/receipts",
  async (request, response, next) => {
    try {
      const id = parseUuid(request.params.purchaseOrderId, "purchase order");
      const receipts = await ownerPurchasingService.listGoodsReceipts(
        request.authUser.id,
        id,
      );
      response.json({ items: receipts });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/goods-receipts/:receiptId", async (request, response, next) => {
  try {
    const id = parseUuid(request.params.receiptId, "goods receipt");
    response.json({
      receipt: await ownerPurchasingService.getGoodsReceipt(
        request.authUser.id,
        id,
      ),
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/goods-receipts/:receiptId/confirm",
  async (request, response, next) => {
    try {
      const id = parseUuid(request.params.receiptId, "goods receipt");
      const receipt = await ownerPurchasingService.confirmGoodsReceipt(
        request.authUser.id,
        request.authUser.id,
        id,
      );
      response.json({ receipt });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/employees/:employeeId/attendance",
  async (request, response, next) => {
    try {
      const employeeId = parseUuid(request.params.employeeId, "employee");
      const items = await ownerAttendancePayrollService.listAttendance(
        request.authUser.id,
        employeeId,
        { from: request.query.from, to: request.query.to },
      );
      response.json({ items });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/employees/:employeeId/attendance",
  parseBody(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      status: z.enum(["PRESENT", "ABSENT", "LEAVE"]),
      checkInAt: z.string().datetime().optional(),
      checkOutAt: z.string().datetime().optional(),
      workingHours: z.number().min(0).max(24).optional(),
      note: z.string().trim().max(500).optional(),
    }),
  ),
  async (request, response, next) => {
    try {
      const employeeId = parseUuid(request.params.employeeId, "employee");
      const record = await ownerAttendancePayrollService.recordAttendance(
        request.authUser.id,
        request.authUser.id,
        employeeId,
        request.validatedBody,
      );
      response.status(201).json({ attendance: record });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/employees/:employeeId/attendance/:attendanceId",
  parseBody(
    z.object({
      status: z.enum(["PRESENT", "ABSENT", "LEAVE"]).optional(),
      checkInAt: z.string().datetime().nullable().optional(),
      checkOutAt: z.string().datetime().nullable().optional(),
      workingHours: z.number().min(0).max(24).nullable().optional(),
      note: z.string().trim().max(500).nullable().optional(),
    }),
  ),
  async (request, response, next) => {
    try {
      const employeeId = parseUuid(request.params.employeeId, "employee");
      const attendanceId = parseUuid(request.params.attendanceId, "attendance");
      const record = await ownerAttendancePayrollService.updateAttendance(
        request.authUser.id,
        request.authUser.id,
        employeeId,
        attendanceId,
        request.validatedBody,
      );
      response.json({ attendance: record });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/employees/:employeeId/payroll-periods",
  async (request, response, next) => {
    try {
      const employeeId = parseUuid(request.params.employeeId, "employee");
      const periods = await ownerAttendancePayrollService.listPayrollPeriods(
        request.authUser.id,
        employeeId,
      );
      response.json({ items: periods });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/employees/:employeeId/payroll-periods",
  parseBody(
    z.object({
      periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amountDue: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
    }),
  ),
  async (request, response, next) => {
    try {
      const employeeId = parseUuid(request.params.employeeId, "employee");
      const period = await ownerAttendancePayrollService.createPayrollPeriod(
        request.authUser.id,
        request.authUser.id,
        employeeId,
        request.validatedBody,
      );
      response.status(201).json({ period });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/payroll-periods/:periodId/payments",
  parseBody(
    z.object({
      amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
      paidAt: z.string().datetime().optional(),
      paymentRef: z.string().trim().max(120).optional(),
      idempotencyKey: z.string().trim().min(1).max(128),
    }),
  ),
  async (request, response, next) => {
    try {
      const periodId = parseUuid(request.params.periodId, "payroll period");
      const payment = await ownerAttendancePayrollService.recordSalaryPayment(
        request.authUser.id,
        request.authUser.id,
        periodId,
        request.validatedBody,
      );
      response.status(201).json({ payment });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/payroll-periods/:periodId/payments",
  async (request, response, next) => {
    try {
      const periodId = parseUuid(request.params.periodId, "payroll period");
      const result = await ownerAttendancePayrollService.listSalaryPayments(
        request.authUser.id,
        periodId,
      );
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);
// =====================================================
// WHOLESALE BILL ROUTES
// =====================================================

const wholesaleUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
}).single("file");

const wholesaleBillSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(1).max(100),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
  notes: z.string().trim().max(1000).optional(),
});

router.post(
  "/wholesale-bills",
  (req, res, next) => {
    wholesaleUpload(req, res, (error) => {
      if (error) {
        next(
          createError(
            400,
            "UPLOAD_ERROR",
            error.message || "File upload failed.",
          ),
        );
        return;
      }

      next();
    });
  },
  parseBody(wholesaleBillSchema),
  async (req, res, next) => {
    try {
      const bill = await uploadWholesaleBill(
        req.authUser.id,
        req.validatedBody,
        req.file,
      );

      res.status(201).json({
        success: true,
        bill,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/wholesale-bills", async (req, res, next) => {
  try {
    const items = await listWholesaleBills(req.authUser.id);

    res.json({
      success: true,
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  "/wholesale-bills/:billId/file",
  validateIdParam("billId"),
  async (req, res, next) => {
    try {
      const file = await getWholesaleBillFile(
        req.authUser.id,
        req.params.billId,
      );

      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="invoice"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      );

      res.send(file.bytes);
    } catch (error) {
      next(error);
    }
  },
);
// =====================================================
// WHOLESALE PAYMENTS - Shop Owner
// =====================================================

const wholesalePaymentSchema = z.object({
  billId: z.string().uuid(),
  amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
  method: z.enum(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"]),
  transactionReference: z.string().trim().max(150).optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().uuid(),
});

// List supplier payment history.
router.get("/wholesale-payments", async (req, res, next) => {
  try {
    const items = await listWholesalePayments(req.authUser.id);

    res.json({
      success: true,
      items,
    });
  } catch (error) {
    next(error);
  }
});

// Record a manual supplier payment.
router.post(
  "/wholesale-payments",
  parseBody(wholesalePaymentSchema),
  async (req, res, next) => {
    try {
      const result = await recordWholesalePayment(
        req.authUser.id,
        req.validatedBody,
      );

      res.status(result.alreadyRecorded ? 200 : 201).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },
);
const ownerWholesalerEditSchema=z.object({name:z.string().trim().min(2).max(120),contactName:z.string().max(100),email:z.union([z.string().email().max(254),z.literal("")]),phone:z.string().max(20)}).strict();
router.patch("/wholesalers/:wholesalerId/details",validateIdParam("wholesalerId"),async(req,res,next)=>{try{res.json({wholesaler:await editWholesaler(req.authUser.id,req.authUser.id,req.params.wholesalerId,ownerWholesalerEditSchema.parse(req.body))});}catch(e){next(e);}});
router.patch("/wholesalers/:wholesalerId/status",validateIdParam("wholesalerId"),async(req,res,next)=>{try{const b=z.object({isActive:z.boolean()}).strict().parse(req.body);res.json(await changeWholesalerStatus(req.authUser.id,req.authUser.id,req.params.wholesalerId,b.isActive));}catch(e){next(e);}});
router.patch("/purchase-orders/:purchaseOrderId/expected-date",validateIdParam("purchaseOrderId"),async(req,res,next)=>{try{const b=z.object({expectedAt:z.union([z.string().datetime(),z.null()])}).strict().parse(req.body);res.json({purchaseOrder:await editPurchaseOrderDate(req.authUser.id,req.authUser.id,req.params.purchaseOrderId,b)});}catch(e){next(e);}});
router.patch("/wholesale-bills/:billId/notes",validateIdParam("billId"),async(req,res,next)=>{try{const b=z.object({notes:z.string().max(1000)}).strict().parse(req.body);res.json({bill:await editBillNotes(req.authUser.id,req.authUser.id,req.params.billId,b)});}catch(e){next(e);}});
router.patch("/wholesale-payments/:paymentId/notes",validateIdParam("paymentId"),async(req,res,next)=>{try{const b=z.object({notes:z.string().max(1000)}).strict().parse(req.body);res.json({payment:await editPaymentNotes(req.authUser.id,req.authUser.id,req.params.paymentId,b)});}catch(e){next(e);}});
export default router;
