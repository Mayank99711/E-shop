ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "shippingWeightGrams" INTEGER;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_shippingWeightGrams_positive" CHECK ("shippingWeightGrams" IS NULL OR "shippingWeightGrams" > 0);
