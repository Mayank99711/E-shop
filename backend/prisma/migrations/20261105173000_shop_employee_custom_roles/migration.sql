CREATE TABLE "ShopEmployeeRole" (
  "id" UUID NOT NULL,
  "shopId" UUID NOT NULL,
  "code" VARCHAR(60) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "defaultPermissions" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopEmployeeRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopEmployeeRole_code_key" ON "ShopEmployeeRole"("code");
CREATE UNIQUE INDEX "ShopEmployeeRole_shopId_name_key" ON "ShopEmployeeRole"("shopId", "name");
CREATE INDEX "ShopEmployeeRole_shopId_idx" ON "ShopEmployeeRole"("shopId");
ALTER TABLE "ShopEmployeeRole" ADD CONSTRAINT "ShopEmployeeRole_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
