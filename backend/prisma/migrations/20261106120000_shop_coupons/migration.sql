CREATE TABLE "ShopCoupon" (
  "id" UUID NOT NULL,
  "shopId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "discountType" TEXT NOT NULL,
  "discountValue" DECIMAL(12,2) NOT NULL,
  "minimumOrder" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "maxDiscount" DECIMAL(12,2),
  "usageLimit" INTEGER,
  "perCustomerLimit" INTEGER DEFAULT 1,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopCoupon_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShopCoupon_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ShopCoupon_discountType_check" CHECK ("discountType" IN ('PERCENTAGE','FIXED')),
  CONSTRAINT "ShopCoupon_value_check" CHECK ("discountValue" > 0 AND ("discountType" <> 'PERCENTAGE' OR "discountValue" <= 100)),
  CONSTRAINT "ShopCoupon_window_check" CHECK ("expiresAt" > "startsAt"),
  CONSTRAINT "ShopCoupon_limit_check" CHECK (("usageLimit" IS NULL OR "usageLimit" > 0) AND ("perCustomerLimit" IS NULL OR "perCustomerLimit" > 0))
);
CREATE UNIQUE INDEX "ShopCoupon_shopId_code_key" ON "ShopCoupon"("shopId", "code");
CREATE INDEX "ShopCoupon_shopId_isActive_idx" ON "ShopCoupon"("shopId", "isActive");
CREATE TABLE "ShopCouponRedemption" (
 "id" UUID NOT NULL,
 "couponId" UUID NOT NULL,
 "customerId" UUID NOT NULL,
 "orderId" UUID NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ShopCouponRedemption_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ShopCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "ShopCoupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ShopCouponRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ShopCouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ShopCouponRedemption_orderId_key" ON "ShopCouponRedemption"("orderId");
CREATE INDEX "ShopCouponRedemption_couponId_customerId_idx" ON "ShopCouponRedemption"("couponId", "customerId");
ALTER TABLE "Order" ADD COLUMN "couponCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
