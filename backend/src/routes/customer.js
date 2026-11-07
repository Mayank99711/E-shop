import { listAvailableCartCoupons } from "../services/customer-coupon-discovery.js";
import { quoteCoupon } from "../services/coupons.js";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";
import { catalogController } from "../controllers/catalog.js";
import { customerCommerceController } from "../controllers/customer-commerce.js";
import { customerController } from "../controllers/customer.js";
import { productReviewsController } from "../controllers/product-reviews.js";
import { productReviewsService } from "../services/product-reviews.js";
import { customerRazorpayService } from "../services/customer-razorpay.js";

const router = Router();
export const catalogRouter = Router();
const uuidSchema = z.string().uuid();
const pageSchema = z.coerce.number().int().min(1).max(10_000).default(1);
const limitSchema = z.coerce.number().int().min(1).max(48).default(24);

function createError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
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

function parseQuery(schema) {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      const error = createError(
        400,
        "VALIDATION_ERROR",
        "Query parameters are invalid.",
      );
      error.details = parsed.error.issues.map(({ path, message }) => ({
        field: path.join("."),
        message,
      }));
      next(error);
      return;
    }
    request.validatedQuery = parsed.data;
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

const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: uuidSchema.optional(),
  subcategoryId: uuidSchema.optional(),
  brandId: uuidSchema.optional(),
  shopId: uuidSchema.optional(),
  sort: z
    .enum(["newest", "name_asc", "name_desc", "price_asc", "price_desc"])
    .default("newest"),
  page: pageSchema,
  limit: limitSchema,
});

const shopQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: pageSchema,
  limit: limitSchema,
});

const reviewText = (max) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/<\/?[a-z][^>]*>/i.test(value),
      "HTML tags are not allowed.",
    );
const createReviewSchema = z.object({
  productId: uuidSchema,
  orderItemId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  title: reviewText(120),
  comment: reviewText(5000),
});
const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    title: reviewText(120).optional(),
    comment: reviewText(5000).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one review field to update.",
  );
const reviewListQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});

catalogRouter.get("/categories", catalogController.categories);
catalogRouter.get("/brands", catalogController.brands);
catalogRouter.get(
  "/shops",
  parseQuery(shopQuerySchema),
  catalogController.shops,
);
catalogRouter.get(
  "/products",
  parseQuery(catalogQuerySchema),
  catalogController.products,
);
catalogRouter.get(
  "/products/:productId",
  validateIdParam("productId"),
  catalogController.product,
);

catalogRouter.get(
  "/products/:productId/reviews",
  validateIdParam("productId"),
  parseQuery(reviewListQuerySchema),
  async (request, response, next) => {
    try {
      const result = await productReviewsService.listPublic(
        request.params.productId,
        request.validatedQuery,
      );

      if (!result) {
        return next(
          createError(404, "PRODUCT_NOT_FOUND", "Product not found."),
        );
      }

      return response.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.use(requireAuth, requireRole("CUSTOMER"));

router.get(
  "/reviews",
  parseQuery(reviewListQuerySchema),
  productReviewsController.list,
);
router.post(
  "/reviews",
  parseBody(createReviewSchema),
  productReviewsController.create,
);
router.patch(
  "/reviews/:reviewId",
  validateIdParam("reviewId"),
  parseBody(updateReviewSchema),
  productReviewsController.update,
);
router.delete(
  "/reviews/:reviewId",
  validateIdParam("reviewId"),
  productReviewsController.delete,
);

router.get("/favourites", customerCommerceController.listFavourites);
router.put(
  "/favourites/:productId",
  validateIdParam("productId"),
  customerCommerceController.addFavourite,
);
router.delete(
  "/favourites/:productId",
  validateIdParam("productId"),
  customerCommerceController.removeFavourite,
);

router.get("/cart", customerCommerceController.getCart);
router.get("/cart/available-coupons", async (request, response, next) => {
  try { response.json(await listAvailableCartCoupons(request.authUser.id)); }
  catch (error) { next(error); }
});

router.post(
  "/cart/items",
  parseBody(
    z.object({
      variantId: uuidSchema,
      quantity: z.number().int().min(1).max(100),
    }),
  ),
  customerCommerceController.addCartItem,
);

router.patch(
  "/cart/items/:itemId",
  validateIdParam("itemId"),
  parseBody(
    z.object({
      quantity: z.number().int().min(1).max(100),
    }),
  ),
  customerController.customerCartItemsItemId_1,
);

router.delete(
  "/cart/items/:itemId",
  validateIdParam("itemId"),
  customerController.customerCartItemsItemId_2,
);

const addressSchema = z.object({
  label: z.string().trim().min(1).max(40),
  recipient: z.string().trim().min(2).max(100),
  mobile: z.string().trim().min(7).max(20),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(3).max(20),
  country: z.string().trim().min(2).max(80).default("India"),
  isDefault: z.boolean().default(false),
});

router.get("/addresses", customerController.customerAddresses_3);

router.post(
  "/addresses",
  parseBody(addressSchema),
  customerController.customerAddresses_4,
);

router.patch(
  "/addresses/:addressId",
  validateIdParam("addressId"),
  parseBody(
    addressSchema
      .partial()
      .refine(
        (value) => Object.keys(value).length > 0,
        "Provide at least one address field to update.",
      ),
  ),
  customerController.customerAddressesAddressId_5,
);

router.delete(
  "/addresses/:addressId",
  validateIdParam("addressId"),
  customerController.customerAddressesAddressId_6,
);

router.get("/orders", customerController.customerOrders_7);

router.get(
  "/orders/:orderId",
  validateIdParam("orderId"),
  customerController.customerOrdersOrderId_8,
);

router.get(
  "/account-deletion-request",
  customerController.customerAccountDeletionRequest_9,
);

router.post(
  "/account-deletion-request",
  parseBody(
    z.object({
      reason: z.string().trim().max(500).optional(),
    }),
  ),
  customerController.customerAccountDeletionRequest_10,
);

router.delete(
  "/account-deletion-request",
  customerController.customerAccountDeletionRequest_11,
);

router.post(
  "/checkout",
  parseBody(
    z.object({
      addressId: uuidSchema.optional(),
      idempotencyKey: z.string().trim().min(1).max(128),
      couponCode: z.string().trim().max(30).optional(),
    }),
  ),
  customerController.customerCheckout_12,
);
router.post(
  "/checkout/razorpay",
  parseBody(
    z.object({
      addressId: uuidSchema.optional(),
      idempotencyKey: z.string().trim().min(1).max(128),
      couponCode: z.string().trim().max(30).optional(),
    }),
  ),
  async (request, response, next) => {
    try {
      const result = await customerRazorpayService.initiate(
        request.authUser.id,
        request.validatedBody.addressId,
        request.validatedBody.idempotencyKey,
        request.validatedBody.couponCode,
      );
      response.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/checkout/razorpay/verify",
  parseBody(
    z.object({
      razorpayOrderId: z.string().min(1),
      razorpayPaymentId: z.string().min(1),
      razorpaySignature: z.string().min(1),
    }),
  ),
  async (request, response, next) => {
    try {
      const result = await customerRazorpayService.verifyPayment(
        request.authUser.id,
        request.validatedBody,
      );
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/checkout/quote",
  parseQuery(z.object({ addressId: uuidSchema.optional(), couponCode: z.string().trim().max(30).optional() })),
  customerController.customerCheckoutQuote_13,
);

export default router;
