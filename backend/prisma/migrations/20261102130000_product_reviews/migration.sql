CREATE TABLE "ProductReview" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductReview_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5)
);

CREATE UNIQUE INDEX "ProductReview_orderItemId_key" ON "ProductReview"("orderItemId");
CREATE INDEX "ProductReview_customerId_createdAt_idx" ON "ProductReview"("customerId", "createdAt");
CREATE INDEX "ProductReview_productId_createdAt_idx" ON "ProductReview"("productId", "createdAt");

ALTER TABLE "ProductReview"
ADD CONSTRAINT "ProductReview_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductReview"
ADD CONSTRAINT "ProductReview_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductReview"
ADD CONSTRAINT "ProductReview_orderItemId_fkey"
FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
