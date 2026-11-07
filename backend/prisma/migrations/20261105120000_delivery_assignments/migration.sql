CREATE TABLE "DeliveryAssignment" (
"id" UUID NOT NULL,
"shopOrderId" UUID NOT NULL,
"shopId" UUID NOT NULL,
"employeeId" UUID NOT NULL,
"status" VARCHAR(32) NOT NULL DEFAULT 'ASSIGNED',
"failureReason" VARCHAR(250),
"assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"pickedUpAt" TIMESTAMP(3),
"outForDeliveryAt" TIMESTAMP(3),
"completedAt" TIMESTAMP(3),
"updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeliveryAssignment_shopOrderId_key" ON "DeliveryAssignment"("shopOrderId");
CREATE INDEX "DeliveryAssignment_shopId_status_idx" ON "DeliveryAssignment"("shopId","status");
CREATE INDEX "DeliveryAssignment_employeeId_status_idx" ON "DeliveryAssignment"("employeeId","status");
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_shopOrderId_fkey" FOREIGN KEY ("shopOrderId") REFERENCES "ShopOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
