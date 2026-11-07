-- Phase 5B proposed migration (REVIEW ONLY - NOT APPLIED)
-- Additive only. Does not modify existing Shop, Product, ProductVariant, User data.

CREATE TYPE "WholesalerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "InventoryMovementReason" AS ENUM ('PURCHASE_RECEIPT', 'MANUAL_ADJUSTMENT', 'CUSTOMER_RETURN');

CREATE TABLE "Wholesaler" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" "WholesalerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Wholesaler_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Wholesaler_code_key" ON "Wholesaler"("code");
CREATE INDEX "Wholesaler_status_name_idx" ON "Wholesaler"("status", "name");

CREATE TABLE "ShopWholesaler" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "wholesalerId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopWholesaler_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopWholesaler_shopId_wholesalerId_key" ON "ShopWholesaler"("shopId", "wholesalerId");
CREATE INDEX "ShopWholesaler_shopId_isActive_idx" ON "ShopWholesaler"("shopId", "isActive");
CREATE INDEX "ShopWholesaler_wholesalerId_isActive_idx" ON "ShopWholesaler"("wholesalerId", "isActive");
ALTER TABLE "ShopWholesaler" ADD CONSTRAINT "ShopWholesaler_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopWholesaler" ADD CONSTRAINT "ShopWholesaler_wholesalerId_fkey" FOREIGN KEY ("wholesalerId") REFERENCES "Wholesaler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "wholesalerId" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseOrder_shopId_status_createdAt_idx" ON "PurchaseOrder"("shopId", "status", "createdAt");
CREATE INDEX "PurchaseOrder_wholesalerId_status_createdAt_idx" ON "PurchaseOrder"("wholesalerId", "status", "createdAt");
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_wholesalerId_fkey" FOREIGN KEY ("wholesalerId") REFERENCES "Wholesaler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "PurchaseOrderItem" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "quantityOrdered" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");
CREATE INDEX "PurchaseOrderItem_productVariantId_idx" ON "PurchaseOrderItem"("productVariantId");
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GoodsReceipt" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GoodsReceipt_purchaseOrderId_createdAt_idx" ON "GoodsReceipt"("purchaseOrderId", "createdAt");
CREATE INDEX "GoodsReceipt_shopId_status_createdAt_idx" ON "GoodsReceipt"("shopId", "status", "createdAt");
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GoodsReceiptItem" (
    "id" UUID NOT NULL,
    "goodsReceiptId" UUID NOT NULL,
    "purchaseOrderItemId" UUID NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "quantityAccepted" INTEGER NOT NULL,
    "quantityDamaged" INTEGER NOT NULL DEFAULT 0,
    "quantityMissing" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GoodsReceiptItem_goodsReceiptId_idx" ON "GoodsReceiptItem"("goodsReceiptId");
CREATE INDEX "GoodsReceiptItem_purchaseOrderItemId_idx" ON "GoodsReceiptItem"("purchaseOrderItemId");
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "InventoryMovementReason" NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" UUID NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryMovement_referenceType_referenceId_key" ON "InventoryMovement"("referenceType", "referenceId");
CREATE INDEX "InventoryMovement_shopId_productVariantId_createdAt_idx" ON "InventoryMovement"("shopId", "productVariantId", "createdAt");
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType", "referenceId");
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
