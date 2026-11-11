
-- Optional variant association for product images.
-- Existing images keep a NULL variantId.

ALTER TABLE "ProductImage"
ADD COLUMN "variantId" UUID;

CREATE INDEX "ProductImage_productId_variantId_idx"
ON "ProductImage"("productId", "variantId");

ALTER TABLE "ProductImage"
ADD CONSTRAINT "ProductImage_variantId_fkey"
FOREIGN KEY ("variantId")
REFERENCES "ProductVariant"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

