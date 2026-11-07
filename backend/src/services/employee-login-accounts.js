import { Prisma } from "@prisma/client";

import { prisma } from "../config/database.js";

import { getOwnerShop } from "./owner-shop.js";

import { EMPLOYEE_ROLES, isValidAssignedEmployeeRole } from "../config/employee-permissions.js";

// Create a structured API error.
function accountError(message, status, code) {
  return Object.assign(new Error(message), {
    status,
    code,
  });
}

/**
 * Create a pending login account for an existing employee.
 *
 * This service does NOT:
 * - Set an employee password
 * - Activate the account
 * - Send an activation email
 * - Enable employee login routes
 */
export async function createPendingEmployeeAccount(
  ownerId,
  actorId,
  employeeId,
  database = prisma,
) {
  // 1. Identify Shop Owner's shop.
  const shop = await getOwnerShop(ownerId, database);

  if (shop.status !== "ACTIVE") {
    throw accountError("The shop must be active.", 403, "SHOP_INACTIVE");
  }

  try {
    return await database.$transaction(
      async (tx) => {
        // 2. Find employee belonging to this shop.
        const employee = await tx.employee.findFirst({
          where: {
            id: employeeId,
            shopId: shop.id,
          },
          select: {
            id: true,
            shopId: true,
            name: true,
            email: true,
            mobile: true,
            isActive: true,
            employeeRole: true,
            permissionOverrides: true,
            userId: true,
          },
        });

        if (!employee) {
          throw accountError(
            "Employee not found in your shop.",
            404,
            "EMPLOYEE_NOT_FOUND",
          );
        }

        // 3. Employee must be active.
        if (!employee.isActive) {
          throw accountError(
            "Activate the employee before enabling login.",
            400,
            "EMPLOYEE_INACTIVE",
          );
        }

        // 4. Employee must have a valid role.
        const allowedRoles = Object.values(EMPLOYEE_ROLES);

        if (!isValidAssignedEmployeeRole(employee.employeeRole, employee.permissionOverrides)) {
          throw accountError(
            "Assign a valid employee role first.",
            400,
            "EMPLOYEE_ROLE_REQUIRED",
          );
        }

        // 5. Verify email address.
        const email = employee.email?.trim().toLowerCase();

        if (
          !email ||
          email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
          throw accountError(
            "A valid employee email is required.",
            400,
            "EMPLOYEE_EMAIL_REQUIRED",
          );
        }

        // 6. Do not create duplicate linked accounts.
        if (employee.userId) {
          throw accountError(
            "This employee already has a linked login account.",
            409,
            "EMPLOYEE_ACCOUNT_EXISTS",
          );
        }

        // 7. Do not overwrite existing User accounts.
        const existingUser = await tx.user.findFirst({
          where: {
            email: {
              equals: email,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
          },
        });

        if (existingUser) {
          throw accountError(
            "This email is already used by another account.",
            409,
            "EMPLOYEE_EMAIL_CONFLICT",
          );
        }

        // 8. Create an INACTIVE user.
        // No password is assigned.
        const user = await tx.user.create({
          data: {
            role: "SHOP_EMPLOYEE",
            name: employee.name,
            email,
            mobile: employee.mobile,
            passwordHash: null,
            isActive: false,
            emailVerifiedAt: null,
          },
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          },
        });

        // 9. Link employee to the new user.
        // The conditional update prevents an existing
        // link from being silently overwritten.
        const linked = await tx.employee.updateMany({
          where: {
            id: employee.id,
            shopId: shop.id,
            userId: null,
          },
          data: {
            userId: user.id,
          },
        });

        if (linked.count !== 1) {
          throw accountError(
            "Employee login linkage has changed. Retry after refreshing.",
            409,
            "EMPLOYEE_LINK_CONFLICT",
          );
        }

        // 10. Record account creation in audit history.
        await tx.auditLog.create({
          data: {
            actorId,
            action: "EMPLOYEE_LOGIN_ACCOUNT_CREATED",
            targetType: "EMPLOYEE",
            targetId: employee.id,
            metadata: {
              userId: user.id,
              role: employee.employeeRole,
              accountStatus: "PENDING_ACTIVATION",
            },
          },
        });

        // 11. Return safe response data.
        return {
          employeeId: employee.id,
          userId: user.id,
          email: user.email,
          role: user.role,
          accountStatus: "PENDING_ACTIVATION",
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    // Concurrent account creation can cause a
    // unique constraint or transaction conflict.
    if (error.code === "P2002" || error.code === "P2034") {
      throw accountError(
        "Account creation conflicted with another request. Refresh and retry.",
        409,
        "EMPLOYEE_ACCOUNT_CONFLICT",
      );
    }

    throw error;
  }
}
