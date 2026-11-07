ALTER TABLE "EmployeeSalaryPayment" ADD COLUMN "idempotencyKey" VARCHAR(128);
CREATE UNIQUE INDEX "EmployeeSalaryPayment_idempotencyKey_key" ON "EmployeeSalaryPayment"("idempotencyKey");
