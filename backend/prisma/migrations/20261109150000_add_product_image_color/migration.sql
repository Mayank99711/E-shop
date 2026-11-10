-- Add optional color association to ProductImage.
-- Existing images retain NULL colorValueId.

ALTER TABLE "ProductImage"
ADD COLUMN "colorValueId" UUID;

CREATE INDEX "ProductImage_productId_colorValueId_idx"
ON "ProductImage"("productId", "colorValueId");

ALTER TABLE "ProductImage"
ADD CONSTRAINT "ProductImage_colorValueId_fkey"
FOREIGN KEY ("colorValueId")
REFERENCES "VariantAttributeValue"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;