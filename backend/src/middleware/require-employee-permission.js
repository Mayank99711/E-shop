import {
  EMPLOYEE_PERMISSIONS,
  getRolePermissions,
  hasEmployeePermission,
} from "../config/employee-permissions.js";

export function requireEmployeePermission(permission) {
  if (!Object.values(EMPLOYEE_PERMISSIONS).includes(permission)) {
    throw new Error(`Unknown employee permission: ${permission}`);
  }

  return (request, response, next) => {
    const user = request.authUser;

    if (!user) {
      return response.status(401).json({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Sign in to continue.",
        },
      });
    }

    if (user.role !== "SHOP_EMPLOYEE") {
      return response.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Employee access required.",
        },
      });
    }

    const employee = user.employeeProfile;

    if (!employee || !employee.isActive || employee.shop?.status !== "ACTIVE") {
      return response.status(403).json({
        error: {
          code: "EMPLOYEE_ACCESS_DENIED",
          message: "Employee access is unavailable.",
        },
      });
    }
    const assignedPermissions = Array.isArray(employee.permissionOverrides)
      ? employee.permissionOverrides
      : getRolePermissions(employee.employeeRole);
    if (!hasEmployeePermission(assignedPermissions, permission)) {
      return response.status(403).json({
        error: {
          code: "PERMISSION_DENIED",
          message: "You do not have permission to perform this action.",
        },
      });
    }

    return next();
  };
}
