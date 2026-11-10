import { createPendingEmployeeAccount } from "../services/employee-login-accounts.js";
import { sendEmployeeActivationInvite } from "../services/employee-activation.js";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { env } from "../config/env.js";
import {
  isStoredProductImage,
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_IMAGE_BYTES,
  removeProductImageFiles,
  saveProductImages,
} from "../utils/product-images.js";
import { getOwnerShop } from "../services/owner-shop.js";
import { createProductVariants } from "../services/owner-product-variants.js";
import { ownerOrdersService } from "../services/owner-orders.js";
import { ownerEmployeesService } from "../services/owner-employees.js";
import { ownerCatalogRequestService } from "../services/owner-catalog-requests.js";
import { ownerProductImageService } from "../services/owner-product-images.js";
import { ownerInventoryService } from "../services/owner-inventory.js";
import { ownerProductService } from "../services/owner-products.js";

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

const productUploadDirectory = fileURLToPath(
  new URL("../../uploads/products/", import.meta.url),
);
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

function normalizeName(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

const variantSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((sku) => sku.toUpperCase()),
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
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(1).max(5000),
  categoryId: uuidSchema,
  brandId: uuidSchema.nullable().optional(),
  images: z.array(imageUrlSchema).max(10).default([]),
  variants: z.array(variantSchema).min(1).max(100),
});

async function writeAudit(
  transaction,
  request,
  action,
  targetType,
  targetId,
  metadata,
) {
  await transaction.auditLog.create({
    data: {
      actorId: request.authUser.id,
      action,
      targetType,
      targetId,
      metadata,
    },
  });
}

export const ownerController = {
  ownerDashboard_1: async (request, response, next) => {
    try {
      const shop = await getOwnerShop(request.authUser.id);
      const [
        products,
        activeProducts,
        inventoryUnits,
        lowStockVariants,
        employees,
        openOrders,
        fulfilledSales,
      ] = await Promise.all([
        prisma.product.count({ where: { shopId: shop.id } }),
        prisma.product.count({ where: { shopId: shop.id, status: "ACTIVE" } }),
        prisma.productVariant.aggregate({
          where: { shopId: shop.id, isActive: true },
          _sum: { stock: true },
        }),
        prisma.productVariant.count({
          where: {
            shopId: shop.id,
            isActive: true,
            stock: { lte: env.LOW_STOCK_THRESHOLD },
          },
        }),
        prisma.employee.count({ where: { shopId: shop.id, isActive: true } }),
        prisma.shopOrder.count({
          where: {
            shopId: shop.id,
            status: {
              in: [
                "PLACED",
                "CONFIRMED",
                "PAYMENT_PROCESSING",
                "INVENTORY_ALLOCATED",
                "PICKING",
                "PACKED",
                "SHIPPED",
                "OUT_FOR_DELIVERY",
              ],
            },
          },
        }),
        prisma.shopOrder.aggregate({
          where: {
            shopId: shop.id,
            status: "DELIVERED",
            order: { payments: { some: { status: "PAID" } } },
          },
          _sum: { subtotal: true },
        }),
      ]);
      response.json({
        shop,
        metrics: {
          products,
          activeProducts,
          inventoryUnits: inventoryUnits._sum.stock || 0,
          lowStockVariants,
          lowStockThreshold: env.LOW_STOCK_THRESHOLD,
          employees,
          openOrders,
          fulfilledSales: fulfilledSales._sum.subtotal || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  },
  ownerCatalogOptions_2: async (_request, response, next) => {
    try {
      const [categories, brands, attributes] = await Promise.all([
        prisma.category.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.brand.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.variantAttribute.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            values: {
              where: { isActive: true },
              orderBy: { value: "asc" },
              select: { id: true, value: true },
            },
          },
        }),
      ]);
      response.json({ categories, brands, attributes });
    } catch (error) {
      next(error);
    }
  },
  ownerProducts_3: async (req, res, next) => {
    try {
      res.json({ items: await ownerProductService.list(req.authUser.id) });
    } catch (error) {
      next(error);
    }
  },
  ownerProducts_4: async (req, res, next) => {
    try {
      const product = await ownerProductService.create(
        req.authUser.id,
        req.authUser.id,
        req.validatedBody,
      );
      res.status(201).json({ product });
    } catch (error) {
      next(error);
    }
  },
  ownerProductsProductIdImages_5: async (req, res, next) => {
    try {
      const images = await ownerProductImageService.upload(
        req.authUser.id,
        req.authUser.id,
        req.params.productId,
        req.files,
        req.body?.colorValueId || null,
      );

      res.status(201).json({ images });
    } catch (error) {
      next(error);
    }
  },
  ownerProductsProductIdImagesImageId_6: async (req, res, next) => {
    try {
      await ownerProductImageService.remove(
        req.authUser.id,
        req.authUser.id,
        req.params.productId,
        req.params.imageId,
      );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
  ownerProductsProductIdVariants_7: async (req, res, next) => {
    try {
      const variants = await ownerProductService.addVariants(
        req.authUser.id,
        req.authUser.id,
        req.params.productId,
        req.validatedBody.variants,
      );
      res.status(201).json({ variants });
    } catch (error) {
      next(error);
    }
  },
  ownerProductsProductId_8: async (request, response, next) => {
    try {
      const updated = await ownerProductService.update(
        request.authUser.id,
        request.authUser.id,
        request.params.productId,
        request.validatedBody,
      );
      response.json({ product: updated });
    } catch (error) {
      next(error);
    }
  },
  ownerProductsProductIdStatus_9: async (req, res, next) => {
    try {
      const product = await ownerProductService.setStatus(
        req.authUser.id,
        req.authUser.id,
        req.params.productId,
        req.validatedBody.status,
      );
      res.json({ product });
    } catch (error) {
      next(error);
    }
  },
  ownerVariantsVariantIdStock_10: async (req, res, next) => {
    try {
      const variant = await ownerInventoryService.setStock(
        req.authUser.id,
        req.authUser.id,
        req.params.variantId,
        req.validatedBody.stock,
      );
      res.json({ variant });
    } catch (error) {
      next(error);
    }
  },
  ownerVariantsVariantId_11: async (req, res, next) => {
    try {
      const variant = await ownerInventoryService.updatePricing(
        req.authUser.id,
        req.authUser.id,
        req.params.variantId,
        req.validatedBody,
      );
      res.json({ variant });
    } catch (error) {
      next(error);
    }
  },
  ownerMasterDataRequests_12: async (req, res, next) => {
    try {
      res.json({
        items: await ownerCatalogRequestService.list(req.authUser.id),
      });
    } catch (error) {
      next(error);
    }
  },
  ownerMasterDataRequests_13: async (req, res, next) => {
    try {
      const { type, proposedData } = req.validatedBody;
      const created = await ownerCatalogRequestService.submit(
        req.authUser.id,
        req.authUser.id,
        type,
        proposedData,
      );
      res.status(201).json({ request: created });
    } catch (error) {
      next(error);
    }
  },
  ownerEmployees_14: async (req, res, next) => {
    try {
      res.json({ items: await ownerEmployeesService.list(req.authUser.id) });
    } catch (error) {
      next(error);
    }
  },
  ownerEmployees_15: async (req, res, next) => {
    try {
      const employee = await ownerEmployeesService.create(
        req.authUser.id,
        req.authUser.id,
        req.validatedBody,
      );
      res.status(201).json({ employee });
    } catch (error) {
      next(error);
    }
  },
  ownerEmployeesEmployeeId_16: async (req, res, next) => {
    try {
      const employee = await ownerEmployeesService.setActive(
        req.authUser.id,
        req.authUser.id,
        req.params.employeeId,
        req.validatedBody.isActive,
      );
      res.json({ employee });
    } catch (error) {
      next(error);
    }
  },

  // Assign employee role
  assignEmployeeRole: async (req, res, next) => {
    try {
      const employee = await ownerEmployeesService.assignRole(
        req.authUser.id,
        req.authUser.id,
        req.params.employeeId,
        req.validatedBody.employeeRole,
      );

      res.json({ employee });
    } catch (error) {
      next(error);
    }
  },

  // Create a pending login account for a shop employee.
  createEmployeeLoginAccount: async (req, res, next) => {
    try {
      const account = await createPendingEmployeeAccount(
        req.authUser.id,
        req.authUser.id,
        req.params.employeeId,
      );

      return res.status(201).json({
        success: true,
        data: account,
      });
    } catch (error) {
      return next(error);
    }
  },
  // Send an activation invitation to a pending employee account.
  sendEmployeeActivation: async (req, res, next) => {
    try {
      const result = await sendEmployeeActivationInvite(
        req.authUser.id,
        req.authUser.id,
        req.params.employeeId,
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  },
  ownerEmployeesEmployeeIdSalaryHistory_17: async (req, res, next) => {
    try {
      res.json(
        await ownerEmployeesService.salaryHistory(
          req.authUser.id,
          req.params.employeeId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
  ownerEmployeesEmployeeIdSalaryHistory_18: async (req, res, next) => {
    try {
      const salary = await ownerEmployeesService.recordSalary(
        req.authUser.id,
        req.authUser.id,
        req.params.employeeId,
        req.validatedBody,
      );
      res.status(201).json({ salary });
    } catch (error) {
      next(error);
    }
  },
  ownerOrders_19: async (request, response, next) => {
    try {
      response.json({
        items: await ownerOrdersService.list(request.authUser.id),
      });
    } catch (error) {
      next(error);
    }
  },
  ownerOrdersOrderIdStatus_20: async (request, response, next) => {
    try {
      const result = await ownerOrdersService.updateStatus(
        request.authUser.id,
        request.params.orderId,
        request.authUser.id,
        request.validatedBody.status,
      );
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
};
