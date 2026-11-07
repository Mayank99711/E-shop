-- CreateEnum
CREATE TYPE "WholesaleBillStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WholesalePaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE');

-- DropIndex


-- DropIndex


-- DropTable


-- CreateTable
CREATE TABLE "WholesaleBill" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "wholesalerId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "invoiceNumber" VARCHAR(100) NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "filePath" VARCHAR(500) NOT NULL,
    "originalFileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "status" "WholesaleBillStatus" NOT NULL DEFAULT 'UNPAID',
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WholesaleBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WholesalePayment" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "WholesalePaymentMethod" NOT NULL,
    "transactionReference" VARCHAR(150),
    "paymentDate" DATE NOT NULL,
    "notes" VARCHAR(1000),
    "idempotencyKey" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WholesalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WholesaleBill_shopId_status_createdAt_idx" ON "WholesaleBill"("shopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WholesaleBill_purchaseOrderId_idx" ON "WholesaleBill"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "WholesaleBill_shopId_wholesalerId_invoiceNumber_key" ON "WholesaleBill"("shopId", "wholesalerId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WholesalePayment_idempotencyKey_key" ON "WholesalePayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WholesalePayment_shopId_paymentDate_idx" ON "WholesalePayment"("shopId", "paymentDate");

-- CreateIndex
CREATE INDEX "WholesalePayment_billId_paymentDate_idx" ON "WholesalePayment"("billId", "paymentDate");

-- AddForeignKey
ALTER TABLE "WholesaleBill" ADD CONSTRAINT "WholesaleBill_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WholesaleBill" ADD CONSTRAINT "WholesaleBill_wholesalerId_fkey" FOREIGN KEY ("wholesalerId") REFERENCES "Wholesaler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WholesaleBill" ADD CONSTRAINT "WholesaleBill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WholesalePayment" ADD CONSTRAINT "WholesalePayment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WholesalePayment" ADD CONSTRAINT "WholesalePayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "WholesaleBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
