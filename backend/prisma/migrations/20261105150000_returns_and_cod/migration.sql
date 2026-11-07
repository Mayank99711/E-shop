CREATE TABLE "ShopReturn" (
  "id" UUID NOT NULL,
  "shopOrderId" UUID NOT NULL,
  "employeeId" UUID,
  "status" VARCHAR(32) NOT NULL DEFAULT 'REQUESTED',
  "reason" VARCHAR(500) NOT NULL,
  "decisionNote" VARCHAR(500),
  "failureReason" VARCHAR(250),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopReturn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopReturn_shopOrderId_key" ON "ShopReturn"("shopOrderId");
CREATE INDEX "ShopReturn_employeeId_status_idx" ON "ShopReturn"("employeeId","status");
CREATE INDEX "ShopReturn_status_createdAt_idx" ON "ShopReturn"("status","createdAt");
ALTER TABLE "ShopReturn" ADD CONSTRAINT "ShopReturn_shopOrderId_fkey" FOREIGN KEY ("shopOrderId") REFERENCES "ShopOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopReturn" ADD CONSTRAINT "ShopReturn_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "DeliveryCodCollection" (
  "id" UUID NOT NULL,
  "assignmentId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "shopId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'COLLECTED',
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "verifiedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryCodCollection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeliveryCodCollection_assignmentId_key" ON "DeliveryCodCollection"("assignmentId");
CREATE UNIQUE INDEX "DeliveryCodCollection_paymentId_key" ON "DeliveryCodCollection"("paymentId");
CREATE INDEX "DeliveryCodCollection_shopId_status_idx" ON "DeliveryCodCollection"("shopId","status");
ALTER TABLE "DeliveryCodCollection" ADD CONSTRAINT "DeliveryCodCollection_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DeliveryAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryCodCollection" ADD CONSTRAINT "DeliveryCodCollection_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
