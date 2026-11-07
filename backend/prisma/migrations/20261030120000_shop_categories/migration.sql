-- Additive migration for ShopCategory separation. Not applied in this phase.

CREATE TABLE "ShopCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" VARCHAR(2048),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopCategory_normalizedName_key" ON "ShopCategory"("normalizedName");
CREATE INDEX "ShopCategory_isActive_name_idx" ON "ShopCategory"("isActive", "name");

ALTER TABLE "Shop" ADD COLUMN "shopCategoryId" UUID;
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_shopCategoryId_fkey" FOREIGN KEY ("shopCategoryId") REFERENCES "ShopCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Shop_shopCategoryId_idx" ON "Shop"("shopCategoryId");
