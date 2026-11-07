import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  FRONTEND_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(86_400_000),
  LOW_STOCK_THRESHOLD: z.coerce.number().int().min(1).max(1_000_000).default(5),
  TAX_JURISDICTION: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().trim().min(2).max(120).optional()),
  TAX_RATE: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), z.string().regex(/^\d{1,3}(\.\d{1,6})?$/).optional()),
  TAX_INCLUSIVE: z.preprocess((value) => value === "true" || value === true, z.boolean()).optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().email().optional(),
  CUSTOMER_PORTAL_URL: z.string().url().default("http://localhost:5173"),
  SHOP_OWNER_PORTAL_URL: z.string().url().default("http://localhost:5173/shop"),
  SUPER_ADMIN_PORTAL_URL: z.string().url().default("http://localhost:5173/admin")
}).superRefine((value, context) => {
  const smtpValues = [value.SMTP_HOST, value.SMTP_PORT, value.SMTP_USER, value.SMTP_PASSWORD, value.MAIL_FROM];
  if (smtpValues.some(Boolean) && smtpValues.some((item) => !item)) {
    context.addIssue({ code: "custom", message: "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and MAIL_FROM must be configured together." });
  }
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  throw new Error(`Invalid server environment: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
}

export const env = {
  ...result.data,
  frontendOrigins: result.data.FRONTEND_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  smtp: result.data.SMTP_HOST ? {
    host: result.data.SMTP_HOST,
    port: result.data.SMTP_PORT,
    user: result.data.SMTP_USER,
    password: result.data.SMTP_PASSWORD,
    from: result.data.MAIL_FROM
  } : null
};
