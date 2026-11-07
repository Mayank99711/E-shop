
-- MyE-Shop Employee Login & Permissions
-- Phase 1 - Step 3B
-- Preserve existing tables, indexes and data.

-- 1. Add employee login role
ALTER TYPE "UserRole" ADD VALUE 'SHOP_EMPLOYEE';

-- 2. Add optional employee fields
ALTER TABLE "Employee"
  ADD COLUMN "employeeRole" TEXT,
  ADD COLUMN "permissionOverrides" JSONB,
  ADD COLUMN "userId" UUID;

-- 3. Allow one employee per login account
CREATE UNIQUE INDEX "Employee_userId_key"
  ON "Employee"("userId");

-- 4. Link Employee to User
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
