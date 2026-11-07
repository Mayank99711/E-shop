/**
 * MyE-Shop Employee Roles and Permissions
 *
 * Role presets provide default module permissions.
 * Individual employee overrides will be supported
 * when database integration is implemented.
 */

export const EMPLOYEE_ROLES = Object.freeze({
  SHOP_MANAGER: "SHOP_MANAGER",
  SALES_STAFF: "SALES_STAFF",
  INVENTORY_STAFF: "INVENTORY_STAFF",
  DELIVERY_ASSOCIATE: "DELIVERY_ASSOCIATE",
});

export const EMPLOYEE_PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: "dashboard.view",

  ORDERS_VIEW: "orders.view",
  ORDERS_MANAGE: "orders.manage",

  PRODUCTS_VIEW: "products.view",
  PRODUCTS_MANAGE: "products.manage",

  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE: "inventory.manage",

  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_MANAGE: "customers.manage",

  DELIVERY_VIEW: "delivery.view",
  DELIVERY_MANAGE: "delivery.manage",

  PAYMENTS_VIEW: "payments.view",
  REPORTS_VIEW: "reports.view",

  EMPLOYEES_VIEW: "employees.view",
  EMPLOYEES_MANAGE: "employees.manage",
  ORDERS_UPDATE: "orders.update", ORDERS_EDIT: "orders.edit", ORDERS_CANCEL: "orders.cancel",
  PRODUCTS_CREATE: "products.create", PRODUCTS_EDIT: "products.edit", PRODUCTS_DELETE: "products.delete",
  INVENTORY_UPDATE: "inventory.update", CUSTOMERS_EDIT: "customers.edit",
  DELIVERY_ASSIGN: "delivery.assign", DELIVERY_PICKUP: "delivery.pickup",
  DELIVERY_UPDATE: "delivery.update", DELIVERY_COMPLETE: "delivery.complete",
  RETURNS_VIEW: "returns.view", RETURNS_ASSIGN: "returns.assign",
  RETURNS_APPROVE: "returns.approve", RETURNS_REJECT: "returns.reject",
  RETURNS_COLLECT: "returns.collect", RETURNS_HANDOVER: "returns.handover",
  PAYMENTS_VERIFY_COD: "payments.verify_cod",
  EMPLOYEES_CREATE: "employees.create", EMPLOYEES_EDIT: "employees.edit",
  EMPLOYEES_ASSIGN: "employees.assign", EMPLOYEES_PERMISSIONS: "employees.permissions",
  EMPLOYEES_DELETE: "employees.delete",
});

const P = EMPLOYEE_PERMISSIONS;

export const ROLE_PERMISSIONS = Object.freeze({
  [EMPLOYEE_ROLES.SHOP_MANAGER]: [
    P.DASHBOARD_VIEW,
    P.ORDERS_VIEW,
    P.ORDERS_MANAGE,
    P.PRODUCTS_VIEW,
    P.PRODUCTS_MANAGE,
    P.INVENTORY_VIEW,
    P.INVENTORY_MANAGE,
    P.CUSTOMERS_VIEW,
    P.CUSTOMERS_MANAGE,
    P.DELIVERY_VIEW,
    P.DELIVERY_MANAGE,
    P.REPORTS_VIEW,
  ],

  [EMPLOYEE_ROLES.SALES_STAFF]: [
    P.DASHBOARD_VIEW,
    P.ORDERS_VIEW,
    P.ORDERS_MANAGE,
    P.PRODUCTS_VIEW,
    P.CUSTOMERS_VIEW,
  ],

  [EMPLOYEE_ROLES.INVENTORY_STAFF]: [
    P.DASHBOARD_VIEW,
    P.PRODUCTS_VIEW,
    P.INVENTORY_VIEW,
    P.INVENTORY_MANAGE,
  ],

  [EMPLOYEE_ROLES.DELIVERY_ASSOCIATE]: [
    P.DASHBOARD_VIEW,
    P.DELIVERY_VIEW,
    P.DELIVERY_MANAGE,
  ],
});

export function getRolePermissions(role) {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

export function hasEmployeePermission(assignedPermissions, requiredPermission) {
  return (
    Array.isArray(assignedPermissions) &&
    assignedPermissions.includes(requiredPermission)
  );
}

// Custom role codes are unguessable and registered per shop on the server.
// They always need employee-specific permissions because static preset lookup is not applicable.
export function isValidAssignedEmployeeRole(role, overrides) {
  return Object.values(EMPLOYEE_ROLES).includes(role) ||
    (typeof role === 'string' && /^CUSTOM_[0-9A-F]{16}$/.test(role) && Array.isArray(overrides));
}
