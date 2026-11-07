import { env } from "../config/env.js";
import { prisma } from "../config/database.js";
import { EMPLOYEE_ROLES, isValidAssignedEmployeeRole } from "../config/employee-permissions.js";
function rejectSession(request, response, next, error) {
  if (error) {
    next(error);
    return;
  }
  response.clearCookie(request.portalSessionCookieName, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
  });
  response.status(401).json({
    error: { code: "SESSION_INVALID", message: "Sign in to continue." },
  });
}

export async function requireAuth(request, response, next) {
  if (!request.session?.userId) {
    response.status(401).json({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Sign in to continue.",
      },
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: request.session.userId },
      select: {
        id: true,
        role: true,
        name: true,
        email: true,
        mobile: true,
        profileImageUrl: true,
        isActive: true,
        emailVerifiedAt: true,
        sessionVersion: true,
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
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });
    if (
      !user ||
      !user.isActive ||
      user.role !== request.session.role ||
      user.sessionVersion !== request.session.sessionVersion ||
      (user.role === "SHOP_OWNER" && user.ownedShop?.status !== "ACTIVE") ||
      (user.role === "SHOP_EMPLOYEE" &&
        (!user.emailVerifiedAt ||
          !user.employeeProfile ||
          !user.employeeProfile.isActive ||
          !isValidAssignedEmployeeRole(
            user.employeeProfile.employeeRole, user.employeeProfile.permissionOverrides,
          ) ||
          user.employeeProfile.shop?.status !== "ACTIVE"))
    ) {
      request.session.destroy((error) =>
        rejectSession(request, response, next, error),
      );
      return;
    }

    request.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.authUser) {
      response.status(401).json({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Sign in to continue.",
        },
      });
      return;
    }
    if (!roles.includes(request.authUser.role)) {
      response.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action.",
        },
      });
      return;
    }
    next();
  };
}
