-- Phase 7E.1 proposed migration (REVIEW ONLY - NOT APPLIED)
-- Additive only.

ALTER TABLE "Payment" ADD COLUMN "providerOrderId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "providerPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "webhookEventId" TEXT;
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'EXPIRED', 'RELEASED');

CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "orderId" UUID,
    "checkoutIdempotencyKey" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryReservation_shopId_status_expiresAt_idx" ON "InventoryReservation"("shopId", "status", "expiresAt");
CREATE INDEX "InventoryReservation_productVariantId_status_idx" ON "InventoryReservation"("productVariantId", "status");
CREATE INDEX "InventoryReservation_checkoutIdempotencyKey_idx" ON "InventoryReservation"("checkoutIdempotencyKey");
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PaymentWebhookEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentWebhookEvent_eventId_key" ON "PaymentWebhookEvent"("eventId");
CREATE INDEX "PaymentWebhookEvent_provider_eventId_idx" ON "PaymentWebhookEvent"("provider", "eventId");
