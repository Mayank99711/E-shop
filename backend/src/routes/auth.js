import { createHash, randomBytes, randomInt } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { env } from "../config/env.js";
import { issueCsrfToken } from "../middleware/csrf.js";
import { requireAuth } from "../middleware/require-auth.js";
import { createLoginRateLimiter } from "../middleware/api-rate-limiters.js";
import { authController } from "../controllers/auth.js";

const router = Router();
const loginLimiter = createLoginRateLimiter();
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const passwordSchema = z.string().min(12).max(128);
const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

function parseBody(schema) {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      const error = new Error("Request validation failed.");
      error.status = 400;
      error.code = "VALIDATION_ERROR";
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

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  mobile: z.string().trim().min(7).max(20).optional(),
  password: passwordSchema,
});

router.get("/csrf", issueCsrfToken);

router.post(
  "/register",
  otpLimiter,
  parseBody(registerSchema),
  authController.authRegister_1,
);

router.post(
  "/verify-email",
  otpLimiter,
  parseBody(
    z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }),
  ),
  authController.authVerifyEmail_2,
);

router.post(
  "/activate-owner",
  otpLimiter,
  parseBody(
    z.object({
      token: z.string().min(32).max(256),
      password: passwordSchema,
    }),
  ),
  authController.authActivateOwner_3,
);
router.post(
  "/activate-employee",
  otpLimiter,
  parseBody(
    z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/i),
        password: passwordSchema,
      })
      .strict(),
  ),
  authController.authActivateEmployee,
);

router.post(
  "/resend-verification",
  otpLimiter,
  parseBody(z.object({ email: emailSchema })),
  authController.authResendVerification_4,
);

router.post(
  "/login",
  loginLimiter,
  parseBody(
    z.object({
      email: emailSchema,
      password: z.string().min(1).max(128),
      role: z.enum(["CUSTOMER", "SHOP_OWNER", "SUPER_ADMIN", "SHOP_EMPLOYEE"]),
      rememberMe: z.boolean().optional(),
    }),
  ),
  authController.authLogin_5,
);

router.get("/me", requireAuth, authController.authMe_6);

router.patch(
  "/me",
  requireAuth,
  parseBody(
    z
      .object({
        name: z.string().trim().min(2).max(100).optional(),
        mobile: z.string().trim().min(7).max(20).nullable().optional(),
      })
      .refine(
        (value) => Object.keys(value).length > 0,
        "Provide at least one profile field to update.",
      ),
  ),
  authController.authMe_7,
);

router.post(
  "/change-password",
  requireAuth,
  parseBody(
    z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: passwordSchema,
    }),
  ),
  authController.authChangePassword_8,
);

router.post("/logout", requireAuth, authController.authLogout);

router.post(
  "/forgot-password",
  resetLimiter,
  parseBody(z.object({ email: emailSchema })),
  authController.authForgotPassword_9,
);

router.post(
  "/reset-password",
  resetLimiter,
  parseBody(
    z.object({
      token: z.string().min(32).max(256),
      password: passwordSchema,
    }),
  ),
  authController.authResetPassword_10,
);

export default router;
