CREATE TABLE "EmployeeActivationToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeActivationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeActivationToken_tokenHash_key"
ON "EmployeeActivationToken"("tokenHash");

CREATE INDEX "EmployeeActivationToken_userId_expiresAt_idx"
ON "EmployeeActivationToken"("userId", "expiresAt");

ALTER TABLE "EmployeeActivationToken"
ADD CONSTRAINT "EmployeeActivationToken_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
