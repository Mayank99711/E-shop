import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database.js";
import { EMPLOYEE_ROLES, isValidAssignedEmployeeRole } from "../config/employee-permissions.js";

function activationError() {
  return Object.assign(
    new Error("The activation link is invalid or expired."),
    {
      status: 400,
      code: "INVALID_ACTIVATION_LINK",
    },
  );
}

export async function activateEmployeeAccount(
  token,
  password,
  database = prisma,
) {
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const now = new Date();

  const activation = await database.employeeActivationToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: {
        select: {
          id: true,
          role: true,
          isActive: true,
          passwordHash: true,
          employeeProfile: {
            select: {
              id: true,
              isActive: true,
              employeeRole: true,
              permissionOverrides: true,
              shop: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!activation || activation.usedAt || activation.expiresAt <= now) {
    throw activationError();
  }

  const user = activation.user;
  const employee = user?.employeeProfile;

  if (!user || !employee) {
    throw activationError();
  }

  if (
    user.role !== "SHOP_EMPLOYEE" ||
    user.isActive ||
    user.passwordHash !== null ||
    !employee ||
    !employee.isActive ||
    !isValidAssignedEmployeeRole(employee.employeeRole, employee.permissionOverrides) ||
    employee.shop.status !== "ACTIVE"
  ) {
    throw activationError();
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await database.$transaction(async (tx) => {
    const consumed = await tx.employeeActivationToken.updateMany({
      where: {
        id: activation.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        usedAt: new Date(),
      },
    });

    if (consumed.count !== 1) {
      throw activationError();
    }

    const account = await tx.user.updateMany({
      where: {
        id: user.id,
        role: "SHOP_EMPLOYEE",
        isActive: false,
        passwordHash: null,
      },
      data: {
        passwordHash,
        isActive: true,
        emailVerifiedAt: new Date(),
        sessionVersion: {
          increment: 1,
        },
      },
    });

    if (account.count !== 1) {
      throw activationError();
    }

    await tx.employeeActivationToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "EMPLOYEE_ACCOUNT_ACTIVATED",
        targetType: "EMPLOYEE",
        targetId: employee.id,
      },
    });
  });

  return {
    success: true,
    message: "Employee account activated. You can now sign in.",
  };
}
