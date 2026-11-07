import { z } from "zod";

const optionalText = (max) => z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? null : value,
  z.string().trim().max(max).nullable().optional()
);

const optionalLogoUrl = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? null : value,
  z.string().url().max(2048).refine(
    (value) => ["http:", "https:"].includes(new URL(value).protocol),
    "Use an HTTP or HTTPS logo URL."
  ).nullable().optional()
);

export const shopBusinessFields = {
  businessName: optionalText(160),
  businessType: optionalText(100),
  taxId: optionalText(100),
  gstNumber: z.preprocess(
    (value) => typeof value === "string" && !value.trim() ? null : value,
    z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid GST number.").nullable().optional()
  ),
  panNumber: z.preprocess(
    (value) => typeof value === "string" && !value.trim() ? null : value,
    z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN number.").nullable().optional()
  ),
  pinCode: optionalText(20),
  city: optionalText(100),
  district: optionalText(100),
  state: optionalText(100),
  country: optionalText(100),
  businessAddress: z.preprocess(
    (value) => typeof value === "string" && !value.trim() ? null : value,
    z.string().trim().min(1).max(500).nullable().optional()
  ),
  contactPhone: z.preprocess(
    (value) => typeof value === "string" && !value.trim() ? null : value,
    z.string().trim().min(7).max(20).nullable().optional()
  ),
  contactEmail: z.preprocess(
    (value) => typeof value === "string" && !value.trim() ? null : value,
    z.string().trim().email().max(254).transform((email) => email.toLowerCase()).nullable().optional()
  ),
  logoUrl: optionalLogoUrl
};

export const shopBusinessProfileSchema = z.object(shopBusinessFields);
