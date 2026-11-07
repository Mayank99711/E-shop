import { randomBytes } from "node:crypto";
import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";

import { Prisma } from "@prisma/client";
import {
  EMPLOYEE_ROLES,
  getRolePermissions,
} from "../config/employee-permissions.js";

const missing = () =>
  Object.assign(new Error("Employee not found in your shop."), {
    status: 404,
    code: "EMPLOYEE_NOT_FOUND",
  });

export function createOwnerEmployeesService(
  database = prisma,
  lookupShop = getOwnerShop,
) {
  return {
    list: async (ownerId) => {
      const shop = await lookupShop(ownerId);
      return database.employee.findMany({
        where: { shopId: shop.id },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        include: { salaryHistory: { orderBy: { effectiveFrom: "desc" } } },
      });
    },
    create: async (ownerId, actorId, data) => {
      const shop = await lookupShop(ownerId);
      const { initialSalary, joiningDate, ...employeeData } = data;
      if (!initialSalary || Number(initialSalary) <= 0) throw Object.assign(new Error("Monthly salary is required."), { status: 400, code: "SALARY_REQUIRED" });
      employeeData.designation ||= "Employee";
      return database.$transaction(async (tx) => {
        const created = await tx.employee.create({
          data: {
            ...employeeData,
            shopId: shop.id,
            employeeCode: `EMP-${randomBytes(5).toString("hex").toUpperCase()}`,
            joiningDate: new Date(`${joiningDate}T00:00:00.000Z`),
            ...(initialSalary
              ? {
                  salaryHistory: {
                    create: {
                      amount: initialSalary,
                      effectiveFrom: new Date(`${joiningDate}T00:00:00.000Z`),
                    },
                  },
                }
              : {}),
          },
          include: { salaryHistory: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "EMPLOYEE_CREATED",
            targetType: "EMPLOYEE",
            targetId: created.id,
            metadata: { employeeCode: created.employeeCode },
          },
        });
        return created;
      });
    },
    setActive: async (ownerId, actorId, employeeId, isActive) => {
      const shop = await lookupShop(ownerId);
      const employee = await database.employee.findFirst({
        where: { id: employeeId, shopId: shop.id },
        select: { id: true },
      });
      if (!employee) throw missing();
      return database.$transaction(async (tx) => {
        const result = await tx.employee.update({
          where: { id: employee.id },
          data: { isActive },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "EMPLOYEE_STATUS_CHANGED",
            targetType: "EMPLOYEE",
            targetId: employee.id,
            metadata: { isActive: result.isActive },
          },
        });
        return result;
      });
    },

    // Assign or update an employee's role.
    assignRole: async (ownerId, actorId, employeeId, employeeRole) => {
      const shop = await lookupShop(ownerId);
      const customRole = employeeRole.startsWith("CUSTOM_")
        ? await database.shopEmployeeRole.findFirst({ where: { shopId: shop.id, code: employeeRole } }) : null;
      if (!Object.values(EMPLOYEE_ROLES).includes(employeeRole) && !customRole) {
        throw Object.assign(new Error("Invalid employee role."), {
          status: 400,
          code: "INVALID_EMPLOYEE_ROLE",
        });
      }

      // The role belongs to this authenticated owner's shop.

      return database.$transaction(async (tx) => {
        // Verify shop ownership inside the transaction.
        const employee = await tx.employee.findFirst({
          where: {
            id: employeeId,
            shopId: shop.id,
          },
          select: {
            id: true,
            employeeRole: true,
          },
        });

        if (!employee) {
          throw missing();
        }

        // Avoid unnecessary updates and audit events.
        if (employee.employeeRole === employeeRole) {
          return tx.employee.findUnique({
            where: { id: employee.id },
          });
        }

        // Update role and clear previous custom overrides.
        const updatedEmployee = await tx.employee.update({
          where: {
            id: employee.id,
          },
          data: {
            employeeRole,
            permissionOverrides: customRole ? customRole.defaultPermissions : Prisma.DbNull,
          },
        });

        // Maintain an audit trail.
        await tx.auditLog.create({
          data: {
            actorId,
            action: "EMPLOYEE_ROLE_CHANGED",
            targetType: "EMPLOYEE",
            targetId: employee.id,
            metadata: {
              previousRole: employee.employeeRole,
              newRole: employeeRole,
              defaultPermissions: customRole ? customRole.defaultPermissions : getRolePermissions(employeeRole),
            },
          },
        });

        return updatedEmployee;
      });
    },

    salaryHistory: async (ownerId, employeeId) => {
      const shop = await lookupShop(ownerId);
      const employee = await database.employee.findFirst({
        where: { id: employeeId, shopId: shop.id },
        select: { id: true, employeeCode: true, name: true },
      });
      if (!employee) throw missing();
      return {
        employee,
        items: await database.employeeSalaryHistory.findMany({
          where: { employeeId: employee.id },
          orderBy: { effectiveFrom: "desc" },
        }),
      };
    },
    recordSalary: async (ownerId, actorId, employeeId, data) => {
      const shop = await lookupShop(ownerId);
      const employee = await database.employee.findFirst({
        where: { id: employeeId, shopId: shop.id },
        select: { id: true },
      });
      if (!employee) throw missing();
      return database.$transaction(async (tx) => {
        const created = await tx.employeeSalaryHistory.create({
          data: {
            employeeId: employee.id,
            amount: data.amount,
            effectiveFrom: new Date(`${data.effectiveFrom}T00:00:00.000Z`),
            note: data.note || null,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "EMPLOYEE_SALARY_RECORDED",
            targetType: "EMPLOYEE",
            targetId: employee.id,
            metadata: { salaryHistoryId: created.id },
          },
        });
        return created;
      });
    },
  };
}

export const ownerEmployeesService = createOwnerEmployeesService();
