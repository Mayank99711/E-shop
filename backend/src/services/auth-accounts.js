import bcrypt from "bcryptjs";
import { prisma } from "../config/database.js";
import { EMPLOYEE_ROLES, isValidAssignedEmployeeRole } from "../config/employee-permissions.js";
export function createAuthAccountService(database = prisma, hasher = bcrypt) {
  return {
    authenticate: async (email, password, role) => {
      const user = await database.user.findUnique({
        where: { email },
        include: {
          ownedShop: {
            select: { status: true },
          },
          employeeProfile: {
            select: {
              id: true,
              isActive: true,
              employeeRole: true,
              permissionOverrides: true,
              shop: {
                select: { status: true },
              },
            },
          },
        },
      });
      const validPassword = user?.passwordHash
        ? await hasher.compare(password, user.passwordHash)
        : false;
      if (
        !user ||
        !validPassword ||
        user.role !== role ||
        !user.isActive ||
        (role === "CUSTOMER" && !user.emailVerifiedAt) ||
        (role === "SHOP_OWNER" && user.ownedShop?.status !== "ACTIVE")
      ) {
        return null;
      }

      if (role === "SHOP_EMPLOYEE") {
        const employee = user.employeeProfile;

        if (
          !user.emailVerifiedAt ||
          !employee ||
          !employee.isActive ||
          !isValidAssignedEmployeeRole(employee.employeeRole, employee.permissionOverrides) ||
          employee.shop?.status !== "ACTIVE"
        ) {
          return null;
        }
      }
      return user;
    },
    updateProfile: (userId, data) =>
      database.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          role: true,
          name: true,
          email: true,
          mobile: true,
          profileImageUrl: true,
        },
      }),
    verifyCurrentPassword: async (userId, password) => {
      const user = await database.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      return user?.passwordHash &&
        (await hasher.compare(password, user.passwordHash))
        ? user.passwordHash
        : null;
    },
    passwordMatches: (password, hash) => hasher.compare(password, hash),
    changePassword: async (userId, password) =>
      database.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hasher.hash(password, 12),
          sessionVersion: { increment: 1 },
        },
        select: { id: true, role: true, sessionVersion: true },
      }),
  };
}

export const authAccountService = createAuthAccountService();
