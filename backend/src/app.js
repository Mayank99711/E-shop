import cors from "cors";
import express from "express";
import { fileURLToPath } from "node:url";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env.js";
import { sessionPool } from "./config/database.js";
import { healthCheck } from "./controllers/health.js";
import { requireCsrf } from "./middleware/csrf.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import customerReturnsRouter from "./routes/returns-customer.js";
import ownerReturnsRouter from "./routes/returns-owner.js";
import employeeReturnsRouter from "./routes/returns-employee.js";
import ownerDeliveryRouter from "./routes/delivery-owner.js";
import employeeDeliveryRouter from "./routes/delivery-employee.js";
import ownerRouter from "./routes/owner.js";
import customerRouter, { catalogRouter } from "./routes/customer.js";
import { requestLogger } from "./middleware/request-logger.middleware.js";
import { customerRazorpayService } from "./services/customer-razorpay.js";
import { createPortalSessionMiddleware } from "./middleware/portal-session.js";
import { createApiRateLimiters } from "./middleware/api-rate-limiters.js";
import employeeRouter from "./routes/employee.js";
const PgSession = connectPgSimple(session);
const app = express();
const { apiLimiter, authApiLimiter } = createApiRateLimiters();

// Log incoming backend requests
app.use(requestLogger);

const productUploadDirectory = fileURLToPath(
  new URL("../uploads/products/", import.meta.url),
);
const masterDataUploadDirectory = fileURLToPath(
  new URL("../uploads/master-data/", import.meta.url),
);
app.disable("x-powered-by");
app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error("Origin is not allowed by CORS");
      error.status = 403;
      callback(error);
    },
    credentials: true,
    exposedHeaders: ["Retry-After"],
  }),
);
app.use("/uploads", (_request, response, next) => {
  response.removeHeader("Cross-Origin-Opener-Policy");
  next();
});
app.use(
  "/uploads/products",
  express.static(productUploadDirectory, {
    dotfiles: "deny",
    index: false,
    immutable: true,
    maxAge: "1d",
    fallthrough: false,
    setHeaders(response) {
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);
app.use("/uploads/master-data", (req, res, next) => {
  const requestedPath = req.path.toLowerCase();

  if (!/\.(jpg|jpeg|png|webp)$/.test(requestedPath)) {
    return res.status(404).json({
      message: "File not found.",
    });
  }

  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});
app.use(
  "/uploads/master-data",
  express.static(masterDataUploadDirectory, {
    dotfiles: "deny",
    index: false,
    immutable: true,
    maxAge: "1d",
    fallthrough: false,
    setHeaders(response) {
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);
app.post(
  "/api/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    try {
      const signature = request.headers["x-razorpay-signature"];
      const eventId = request.headers["x-razorpay-event-id"];
      const result = await customerRazorpayService.handleWebhook(
        request.body,
        signature,
        eventId,
      );
      response.json(result);
    } catch (error) {
      response.status(error.status || 500).json({
        error: {
          code: error.code || "WEBHOOK_ERROR",
          message: error.message,
        },
      });
    }
  },
);

app.use(express.json({ limit: "1mb" }));
app.use("/api", apiLimiter);
app.use("/api/auth", authApiLimiter);
const useMemorySessionStore =
  process.env.NODE_ENV === "test" &&
  process.env.USE_MEMORY_SESSION_STORE === "true";

const sessionStore = useMemorySessionStore
  ? new session.MemoryStore()
  : new PgSession({
      pool: sessionPool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    });

app.use(
  createPortalSessionMiddleware(session, {
    store: sessionStore,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: env.SESSION_MAX_AGE_MS,
    },
  }),
);

const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "E-Shop API",
    version: "1.0.0",
    description:
      "Shared API for the E-Shop customer, shop owner, and super admin portals.",
  },
  servers: [{ url: `http://localhost:${env.PORT}` }],
  paths: {
    "/api/health": {
      get: {
        summary: "Check API and database availability",
        responses: {
          200: { description: "API and database are available" },
          503: { description: "Database is unavailable" },
        },
      },
    },
    "/api/auth/csrf": {
      get: {
        summary: "Issue a CSRF token for a browser session",
        responses: { 200: { description: "CSRF token issued" } },
      },
    },
    "/api/auth/register": {
      post: {
        summary: "Register a customer and send email verification",
        responses: {
          201: { description: "Registration accepted" },

          503: { description: "SMTP is not configured" },
        },
      },
    },
    "/api/auth/verify-email": {
      post: {
        summary: "Verify a customer email using its six-digit code",
        responses: {
          200: { description: "Email verified" },
          400: { description: "Code invalid or expired" },
        },
      },
    },
    "/api/auth/activate-owner": {
      post: {
        summary: "Consume an owner activation link and set the first password",
        responses: {
          200: { description: "Owner account activated" },
          400: { description: "Activation link invalid or expired" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        summary: "Create a role-scoped server-side session",
        responses: {
          200: { description: "Session created" },
          401: { description: "Credentials invalid or account inactive" },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        summary: "Destroy the current server-side session",
        responses: { 204: { description: "Session destroyed" } },
      },
    },
    "/api/auth/me": {
      get: {
        summary: "Return the current authenticated user",
        responses: {
          200: { description: "Current user" },
          401: { description: "Not authenticated" },
        },
      },
      patch: {
        summary: "Update the authenticated user's own profile fields",
        responses: { 200: { description: "Profile updated" } },
      },
    },
    "/api/auth/change-password": {
      post: {
        summary: "Change password and invalidate other sessions",
        responses: {
          200: { description: "Password changed" },
          400: { description: "Current password is incorrect" },
        },
      },
    },
    "/api/auth/forgot-password": {
      post: {
        summary:
          "Request a password-reset email without disclosing account existence",
        responses: { 202: { description: "Generic response returned" } },
      },
    },
    "/api/auth/reset-password": {
      post: {
        summary: "Consume a single-use password-reset token",
        responses: {
          200: { description: "Password updated" },
          400: { description: "Token invalid or expired" },
        },
      },
    },
    "/api/admin/dashboard": {
      get: {
        summary: "Return live platform counts for Super Admin",
        responses: {
          200: { description: "Dashboard metrics" },
          403: { description: "Super Admin required" },
        },
      },
    },
    "/api/admin/shops": {
      get: {
        summary: "List shops and assigned owners",
        responses: { 200: { description: "Paginated shop records" } },
      },
      post: {
        summary:
          "Create a shop, optional business profile, and send its owner a single-use activation link",
        responses: {
          201: { description: "Shop created" },
          502: { description: "Activation email delivery failed" },
        },
      },
    },
    "/api/admin/shops/{shopId}/status": {
      patch: {
        summary: "Activate, deactivate, or archive a shop",
        responses: { 200: { description: "Shop status updated" } },
      },
    },
    "/api/admin/shops/{shopId}": {
      patch: {
        summary:
          "Update the shop's platform-managed details and optional business profile",
      },
    },
    "/api/admin/shops/{shopId}/resend-activation": {
      post: {
        summary: "Issue a replacement owner activation link",
        responses: { 200: { description: "Activation link sent" } },
      },
    },
    "/api/admin/categories": {
      get: {
        summary: "List global categories",
        responses: { 200: { description: "Category records" } },
      },
      post: {
        summary: "Create a global category",
        responses: { 201: { description: "Category created" } },
      },
    },
    "/api/admin/categories/{categoryId}": {
      patch: {
        summary:
          "Rename or re-parent a global category; invalid parent cycles are rejected",
      },
    },
    "/api/admin/account-deletion-requests": {
      get: {
        summary: "List customer account deletion requests for review",
        responses: { 200: { description: "Paginated deletion requests" } },
      },
    },
    "/api/admin/account-deletion-requests/{requestId}": {
      patch: {
        summary: "Acknowledge or reject a customer account deletion request",
      },
    },
    "/api/admin/brands": {
      get: {
        summary: "List global brands",
        responses: { 200: { description: "Brand records" } },
      },
      post: {
        summary: "Create a global brand",
        responses: { 201: { description: "Brand created" } },
      },
    },
    "/api/admin/brands/{brandId}": {
      patch: { summary: "Update or deactivate a global brand" },
    },
    "/api/admin/variant-attributes": {
      get: {
        summary: "List global variant attributes and values",
        responses: { 200: { description: "Variant attribute records" } },
      },
      post: {
        summary: "Create a global variant attribute",
        responses: { 201: { description: "Attribute created" } },
      },
    },
    "/api/admin/variant-attributes/{attributeId}/values": {
      post: {
        summary: "Add an allowed value to a variant attribute",
        responses: { 201: { description: "Value created" } },
      },
    },
    "/api/admin/variant-attributes/{attributeId}": {
      patch: { summary: "Update or deactivate a variant attribute" },
    },
    "/api/admin/variant-attributes/{attributeId}/values/{valueId}": {
      patch: { summary: "Rename or deactivate an allowed variant value" },
    },
    "/api/admin/master-data-requests": {
      get: {
        summary: "List shop-owner master-data requests",
        responses: { 200: { description: "Paginated requests" } },
      },
    },
    "/api/admin/master-data-requests/{requestId}": {
      patch: {
        summary: "Approve or reject a master-data request",
        responses: {
          200: { description: "Request reviewed" },
          409: { description: "Request already reviewed" },
        },
      },
    },
    "/api/owner/dashboard": {
      get: {
        summary: "Return shop-scoped owner dashboard metrics",
        responses: {
          200: { description: "Shop dashboard" },
          403: { description: "Shop Owner required" },
        },
      },
    },
    "/api/owner/shop": {
      get: {
        summary:
          "Return the authenticated owner's shop details and business profile",
      },
      patch: {
        summary:
          "Update optional business name, type, tax ID, address, or logo URL for the authenticated owner's shop",
      },
    },
    "/api/owner/catalog-options": {
      get: {
        summary: "List active global catalog options for product creation",
      },
    },
    "/api/owner/products": {
      get: {
        summary:
          "List products and saved image references owned by the authenticated shop",
      },
      post: {
        summary:
          "Create a shop product with variants, image references, and initial inventory",
      },
    },
    "/api/owner/products/{productId}": {
      patch: { summary: "Update details for a shop-owned product" },
    },
    "/api/owner/products/{productId}/images": {
      post: {
        summary:
          "Upload up to six validated JPEG, PNG, or WebP images to a shop-owned product",
        description:
          "Multipart form field `images`; each file is limited to 5 MB and each product to 10 total images.",
        responses: {
          201: { description: "Images stored and attached" },
          400: { description: "Invalid image or image limit exceeded" },
          401: { description: "Authentication required" },
          403: { description: "Shop Owner role or CSRF token required" },
          413: { description: "Image exceeds the file size limit" },
        },
      },
    },
    "/api/owner/products/{productId}/images/{imageId}": {
      delete: {
        summary: "Remove an image from a shop-owned product",
        responses: {
          204: { description: "Image removed" },
          404: { description: "Image not found for this shop" },
        },
      },
    },
    "/api/owner/products/{productId}/status": {
      patch: { summary: "Publish, pause, or archive a shop-owned product" },
    },
    "/api/owner/products/{productId}/variants": {
      post: { summary: "Add product variants with shop-unique SKUs" },
    },
    "/api/owner/variants/{variantId}/stock": {
      patch: {
        summary:
          "Update inventory for a variant owned by the authenticated shop",
      },
    },
    "/api/owner/variants/{variantId}": {
      patch: {
        summary: "Update pricing and inventory for a shop-owned variant",
      },
    },
    "/api/owner/master-data-requests": {
      get: { summary: "List requests submitted by the authenticated shop" },
      post: { summary: "Submit a request for new global catalog data" },
    },
    "/api/owner/employees": {
      get: {
        summary:
          "List employees and current salary entries for the authenticated shop",
      },
      post: { summary: "Create an employee for the authenticated shop" },
    },
    "/api/owner/employees/{employeeId}/salary-history": {
      get: { summary: "Read salary history for a shop-owned employee" },
      post: {
        summary: "Record a salary history change for a shop-owned employee",
      },
    },
    "/api/owner/employees/{employeeId}": {
      patch: { summary: "Activate or deactivate a shop-owned employee" },
    },
    "/api/owner/orders": {
      get: { summary: "List orders fulfilled by the authenticated shop" },
    },
    "/api/owner/orders/{orderId}/status": {
      patch: {
        summary: "Advance a shop order through its allowed fulfillment states",
      },
    },
    "/api/catalog/products": {
      get: {
        summary:
          "Browse active products from active shops with search, filters, and pagination",
        responses: { 200: { description: "Paginated public product catalog" } },
      },
    },
    "/api/catalog/products/{productId}": {
      get: {
        summary:
          "Read an active product with seller, images, and variant options",
        responses: {
          200: { description: "Product details" },
          404: { description: "Product unavailable" },
        },
      },
    },
    "/api/catalog/categories": {
      get: {
        summary: "List active categories",
        responses: { 200: { description: "Available categories" } },
      },
    },
    "/api/catalog/brands": {
      get: {
        summary: "List active brands",
        responses: { 200: { description: "Available brands" } },
      },
    },
    "/api/customer/favourites": {
      get: {
        summary: "List the authenticated customer's saved products",
        responses: {
          200: { description: "Customer favourites" },
          401: { description: "Customer sign-in required" },
        },
      },
    },
    "/api/customer/favourites/{productId}": {
      put: {
        summary: "Save a product to the authenticated customer's favourites",
      },
      delete: {
        summary:
          "Remove a product from the authenticated customer's favourites",
      },
    },
    "/api/customer/cart": {
      get: {
        summary: "Read the authenticated customer's persistent cart",
        responses: {
          200: { description: "Cart with current availability and prices" },
        },
      },
    },
    "/api/customer/cart/items": {
      post: {
        summary: "Add an available product variant to the customer's cart",
        responses: {
          201: { description: "Cart item saved" },
          409: { description: "Requested quantity exceeds stock" },
        },
      },
    },
    "/api/customer/addresses": {
      get: { summary: "List the authenticated customer's addresses" },
      post: { summary: "Create a customer-owned address" },
    },
    "/api/customer/orders": {
      get: {
        summary:
          "List orders and shop-level fulfilments for the authenticated customer",
      },
    },
    "/api/customer/account-deletion-request": {
      get: {
        summary:
          "Read the authenticated customer's current account deletion request",
      },
      post: {
        summary:
          "Submit or resubmit an account deletion request; no data is deleted automatically",
        responses: { 202: { description: "Deletion request submitted" } },
      },
      delete: { summary: "Cancel a pending account deletion request" },
    },
    "/api/customer/checkout": {
      post: {
        summary:
          "Checkout is fail-closed until payment, shipping, and tax policies are configured",
        responses: {
          503: {
            description:
              "No order or payment is created while checkout policies are unset",
          },
        },
      },
    },
  },
};

app.get("/api/health", healthCheck);
app.use(requireCsrf);

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/customer/returns", customerReturnsRouter);
app.use("/api/owner/returns", ownerReturnsRouter);
app.use("/api/employee/returns", employeeReturnsRouter);
app.use("/api/owner/delivery-assignments", ownerDeliveryRouter);
app.use("/api/employee/assignments", employeeDeliveryRouter);
app.use("/api/owner", ownerRouter);

// NEW: Employee Dashboard API
app.use("/api/employee", employeeRouter);

app.use("/api/catalog", catalogRouter);
app.use("/api/customer", customerRouter);
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested endpoint does not exist.",
    },
  });
});
app.use((error, _request, response, _next) => {
  if (response.headersSent) return;
  const isUniqueConflict = error.code === "P2002";
  const isMissingRecord = error.code === "P2025";
  const isMissingTable = error.code === "P2021";
  const isMissingColumn = error.code === "P2022";
  const isMigrationRequired = isMissingTable || isMissingColumn;
  const status = isMigrationRequired
    ? 503
    : isUniqueConflict
      ? 409
      : isMissingRecord
        ? 404
        : Number.isInteger(error.status) &&
            error.status >= 400 &&
            error.status < 600
          ? error.status
          : 500;
  if (status >= 500) console.error(error);
  const code = isMigrationRequired
    ? "MIGRATION_REQUIRED"
    : isUniqueConflict
      ? "DUPLICATE_RECORD"
      : isMissingRecord
        ? "RECORD_NOT_FOUND"
        : error.code || "INTERNAL_SERVER_ERROR";
  const message = isMigrationRequired
    ? "A required database table or column is missing. Apply the pending migration before using this feature."
    : status === 500
      ? "An unexpected server error occurred."
      : isUniqueConflict
        ? "A record with the same unique value already exists."
        : isMissingRecord
          ? "The requested record does not exist."
          : error.message;
  response.status(status).json({
    error: {
      code,
      message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
});

export default app;
