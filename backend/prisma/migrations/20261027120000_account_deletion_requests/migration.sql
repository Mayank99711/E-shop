CREATE TYPE "AccountDeletionStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'REJECTED', 'CANCELLED');

CREATE TABLE "AccountDeletionRequest" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(500),
    "reviewerId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountDeletionRequest_customerId_key" ON "AccountDeletionRequest"("customerId");
CREATE INDEX "AccountDeletionRequest_status_createdAt_idx" ON "AccountDeletionRequest"("status", "createdAt");

ALTER TABLE "AccountDeletionRequest"
ADD CONSTRAINT "AccountDeletionRequest_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountDeletionRequest"
ADD CONSTRAINT "AccountDeletionRequest_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
