import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createOwnerAttendancePayrollService(database = prisma, lookupShop = getOwnerShop) {
  async function ownedEmployee(ownerId, employeeId) {
    const shop = await lookupShop(ownerId);
    const employee = await database.employee.findFirst({ where: { id: employeeId, shopId: shop.id }, select: { id: true, shopId: true } });
    if (!employee) throw fail(404, "EMPLOYEE_NOT_FOUND", "Employee not found in your shop.");
    return { shop, employee };
  }

  return {
    listAttendance: async (ownerId, employeeId, { from, to } = {}) => {
      const { shop, employee } = await ownedEmployee(ownerId, employeeId);
      const where = { employeeId: employee.id, shopId: shop.id };
      if (from || to) {
        where.date = {};
        if (from) where.date.gte = new Date(`${from}T00:00:00.000Z`);
        if (to) where.date.lte = new Date(`${to}T00:00:00.000Z`);
      }
      return database.employeeAttendance.findMany({ where, orderBy: { date: "desc" } });
    },

    recordAttendance: async (ownerId, actorId, employeeId, data) => {
      const { shop, employee } = await ownedEmployee(ownerId, employeeId);
      const date = new Date(`${data.date}T00:00:00.000Z`);
      const existing = await database.employeeAttendance.findUnique({ where: { employeeId_date: { employeeId: employee.id, date } } });
      if (existing) throw fail(409, "ATTENDANCE_ALREADY_RECORDED", "Attendance already recorded for this date.");
      const checkInAt = data.checkInAt ? new Date(data.checkInAt) : null;
      const checkOutAt = data.checkOutAt ? new Date(data.checkOutAt) : null;
      let workingHours = data.workingHours;
      if (workingHours === undefined && checkInAt && checkOutAt) {
        workingHours = (checkOutAt.getTime() - checkInAt.getTime()) / 3600000;
      }
      return database.$transaction(async (tx) => {
        let created;
        try {
          created = await tx.employeeAttendance.create({
            data: {
              employeeId: employee.id,
              shopId: shop.id,
              date,
              status: data.status,
              checkInAt,
              checkOutAt,
              workingHours: workingHours === undefined || workingHours === null ? null : workingHours,
              note: data.note || null,
              recordedById: actorId
            }
          });
        } catch (error) {
          if (error.code === "P2002") throw fail(409, "ATTENDANCE_ALREADY_RECORDED", "Attendance already recorded for this date.");
          throw error;
        }
        await tx.auditLog.create({ data: { actorId, action: "ATTENDANCE_RECORDED", targetType: "EMPLOYEE_ATTENDANCE", targetId: created.id, metadata: { employeeId: employee.id, status: data.status } } });
        return created;
      });
    },

    updateAttendance: async (ownerId, actorId, employeeId, attendanceId, data) => {
      const { shop, employee } = await ownedEmployee(ownerId, employeeId);
      const attendance = await database.employeeAttendance.findFirst({ where: { id: attendanceId, employeeId: employee.id, shopId: shop.id } });
      if (!attendance) throw fail(404, "ATTENDANCE_NOT_FOUND", "Attendance record not found.");
      const update = {};
      if (data.status) update.status = data.status;
      if (data.checkInAt !== undefined) update.checkInAt = data.checkInAt ? new Date(data.checkInAt) : null;
      if (data.checkOutAt !== undefined) update.checkOutAt = data.checkOutAt ? new Date(data.checkOutAt) : null;
      if (data.workingHours !== undefined) update.workingHours = data.workingHours;
      if (data.note !== undefined) update.note = data.note;
      return database.$transaction(async (tx) => {
        const updated = await tx.employeeAttendance.update({ where: { id: attendance.id }, data: update });
        await tx.auditLog.create({ data: { actorId, action: "ATTENDANCE_UPDATED", targetType: "EMPLOYEE_ATTENDANCE", targetId: attendance.id, metadata: { fields: Object.keys(update) } } });
        return updated;
      });
    },
    listPayrollPeriods: async (ownerId, employeeId) => {
      const { shop, employee } = await ownedEmployee(ownerId, employeeId);
      return database.employeePayrollPeriod.findMany({
        where: { employeeId: employee.id, shopId: shop.id },
        orderBy: { periodStart: "desc" },
        include: { payments: { orderBy: { paidAt: "desc" } } }
      });
    },

    createPayrollPeriod: async (ownerId, actorId, employeeId, data) => {
      const { shop, employee } = await ownedEmployee(ownerId, employeeId);
      const amountDue = Number(data.amountDue);
      if (!Number.isFinite(amountDue) || amountDue <= 0) throw fail(400, "INVALID_AMOUNT_DUE", "Amount due must be greater than zero.");
      const periodStart = new Date(`${data.periodStart}T00:00:00.000Z`);
      const periodEnd = new Date(`${data.periodEnd}T00:00:00.000Z`);
      if (periodEnd < periodStart) throw fail(400, "INVALID_PERIOD", "Period end must be after period start.");
      return database.$transaction(async (tx) => {
        const period = await tx.employeePayrollPeriod.create({
          data: { employeeId: employee.id, shopId: shop.id, periodStart, periodEnd, amountDue, status: "PENDING" }
        });
        await tx.auditLog.create({ data: { actorId, action: "PAYROLL_PERIOD_CREATED", targetType: "EMPLOYEE_PAYROLL_PERIOD", targetId: period.id, metadata: { amountDue } } });
        return period;
      });
    },

    recordSalaryPayment: async (ownerId, actorId, periodId, data) => {
      const shop = await lookupShop(ownerId);
      const key = data.idempotencyKey;

      // Idempotent replay check (read-only, ownership verified)
      const existingByKey = await database.employeeSalaryPayment.findUnique({ where: { idempotencyKey: key } });
      if (existingByKey) {
        if (existingByKey.shopId !== shop.id || existingByKey.payrollPeriodId !== periodId) {
          throw fail(409, "IDEMPOTENCY_KEY_CONFLICT", "This idempotency key is already used for a different payment.");
        }
        const sameAmount = Number(existingByKey.amount) === Number(data.amount);
        const sameRef = (existingByKey.paymentRef || null) === (data.paymentRef || null);
        if (!sameAmount || !sameRef) {
          throw fail(409, "IDEMPOTENCY_KEY_CONFLICT", "This idempotency key was used with different payment details.");
        }
        return existingByKey;
      }

      return database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "EmployeePayrollPeriod" WHERE id = ${periodId}::uuid FOR UPDATE`;
        const period = await tx.employeePayrollPeriod.findFirst({ where: { id: periodId, shopId: shop.id }, include: { payments: true } });
        if (!period) throw fail(404, "PAYROLL_PERIOD_NOT_FOUND", "Payroll period not found.");
        const amount = Number(data.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw fail(400, "INVALID_PAYMENT_AMOUNT", "Payment amount must be greater than zero.");
        const paidSoFar = period.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        const outstanding = Number(period.amountDue) - paidSoFar;
        if (amount > outstanding + 0.0001) throw fail(400, "PAYMENT_EXCEEDS_OUTSTANDING", "Payment amount exceeds outstanding balance.");

        let payment;
        try {
          payment = await tx.employeeSalaryPayment.create({
            data: {
              payrollPeriodId: period.id,
              employeeId: period.employeeId,
              shopId: shop.id,
              amount,
              paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
              paymentRef: data.paymentRef || null,
              idempotencyKey: key,
              recordedById: actorId
            }
          });
        } catch (error) {
          if (error.code === "P2002") {
            const existing = await tx.employeeSalaryPayment.findUnique({ where: { idempotencyKey: key } });
            if (existing) {
              if (existing.shopId !== shop.id || existing.payrollPeriodId !== periodId) throw fail(409, "IDEMPOTENCY_KEY_CONFLICT", "This idempotency key is already used for a different payment.");
              const sameAmount = Number(existing.amount) === Number(data.amount);
              const sameRef = (existing.paymentRef || null) === (data.paymentRef || null);
              if (!sameAmount || !sameRef) throw fail(409, "IDEMPOTENCY_KEY_CONFLICT", "This idempotency key was used with different payment details.");
              return existing;
            }
          }
          throw error;
        }

        const newPaid = paidSoFar + amount;
        const status = newPaid + 0.0001 >= Number(period.amountDue) ? "PAID" : "PARTIAL";
        await tx.employeePayrollPeriod.update({ where: { id: period.id }, data: { status } });
        await tx.auditLog.create({ data: { actorId, action: "SALARY_PAYMENT_RECORDED", targetType: "EMPLOYEE_SALARY_PAYMENT", targetId: payment.id, metadata: { amount, periodId: period.id } } });
        return payment;
      });
    },

    listSalaryPayments: async (ownerId, periodId) => {
      const shop = await lookupShop(ownerId);
      const period = await database.employeePayrollPeriod.findFirst({ where: { id: periodId, shopId: shop.id }, include: { payments: { orderBy: { paidAt: "desc" } } } });
      if (!period) throw fail(404, "PAYROLL_PERIOD_NOT_FOUND", "Payroll period not found.");
      const paid = period.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      return { period, payments: period.payments, outstanding: Number(period.amountDue) - paid };
    }
  };
}

export const ownerAttendancePayrollService = createOwnerAttendancePayrollService();
