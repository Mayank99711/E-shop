-- Phase 6B proposed migration (REVIEW ONLY - NOT APPLIED)
-- Additive only: attendance and payroll payment tables.

CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE');
CREATE TYPE "PayrollStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

CREATE TABLE "EmployeeAttendance" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "workingHours" DECIMAL(6,2),
    "note" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeAttendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmployeeAttendance_employeeId_date_key" ON "EmployeeAttendance"("employeeId", "date");
CREATE INDEX "EmployeeAttendance_shopId_date_idx" ON "EmployeeAttendance"("shopId", "date");
CREATE INDEX "EmployeeAttendance_employeeId_date_idx" ON "EmployeeAttendance"("employeeId", "date");
ALTER TABLE "EmployeeAttendance" ADD CONSTRAINT "EmployeeAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeAttendance" ADD CONSTRAINT "EmployeeAttendance_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeAttendance" ADD CONSTRAINT "EmployeeAttendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EmployeePayrollPeriod" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeePayrollPeriod_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeePayrollPeriod_shopId_periodStart_periodEnd_idx" ON "EmployeePayrollPeriod"("shopId", "periodStart", "periodEnd");
CREATE INDEX "EmployeePayrollPeriod_employeeId_periodStart_idx" ON "EmployeePayrollPeriod"("employeeId", "periodStart");
ALTER TABLE "EmployeePayrollPeriod" ADD CONSTRAINT "EmployeePayrollPeriod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeePayrollPeriod" ADD CONSTRAINT "EmployeePayrollPeriod_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EmployeeSalaryPayment" (
    "id" UUID NOT NULL,
    "payrollPeriodId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentRef" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeSalaryPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeSalaryPayment_payrollPeriodId_idx" ON "EmployeeSalaryPayment"("payrollPeriodId");
CREATE INDEX "EmployeeSalaryPayment_employeeId_paidAt_idx" ON "EmployeeSalaryPayment"("employeeId", "paidAt");
ALTER TABLE "EmployeeSalaryPayment" ADD CONSTRAINT "EmployeeSalaryPayment_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "EmployeePayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeSalaryPayment" ADD CONSTRAINT "EmployeeSalaryPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeSalaryPayment" ADD CONSTRAINT "EmployeeSalaryPayment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeSalaryPayment" ADD CONSTRAINT "EmployeeSalaryPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
