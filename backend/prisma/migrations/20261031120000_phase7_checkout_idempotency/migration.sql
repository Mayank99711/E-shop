ALTER TABLE "Order" ADD COLUMN "checkoutIdempotencyKey" VARCHAR(128);
CREATE UNIQUE INDEX "Order_checkoutIdempotencyKey_key" ON "Order"("checkoutIdempotencyKey");
