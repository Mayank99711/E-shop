import test from "node:test";
import assert from "node:assert/strict";

import { requireEmployeePermission } from "../src/middleware/require-employee-permission.js";

function checkAccess(role, permission) {
  return new Promise((resolve) => {
    const request = {
      authUser: {
        role: "SHOP_EMPLOYEE",
        employeeProfile: {
          isActive: true,
          employeeRole: role,
          shop: { status: "ACTIVE" },
        },
      },
    };

    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ allowed: false, status: this.statusCode, body });
        return this;
      },
    };

    requireEmployeePermission(permission)(request, response, () =>
      resolve({ allowed: true, status: 200 }),
    );
  });
}

test("Sales staff can view orders", async () => {
  const result = await checkAccess("SALES_STAFF", "orders.view");
  assert.equal(result.allowed, true);
});

test("Sales staff cannot manage inventory", async () => {
  const result = await checkAccess("SALES_STAFF", "inventory.manage");
  assert.equal(result.status, 403);
});

test("Inventory staff can view inventory", async () => {
  const result = await checkAccess("INVENTORY_STAFF", "inventory.view");
  assert.equal(result.allowed, true);
});

test("Delivery associate cannot manage employees", async () => {
  const result = await checkAccess("DELIVERY_ASSOCIATE", "employees.manage");
  assert.equal(result.status, 403);
});

test("Inactive employee is denied", async () => {
  const request = {
    authUser: {
      role: "SHOP_EMPLOYEE",
      employeeProfile: {
        isActive: false,
        employeeRole: "SALES_STAFF",
        shop: { status: "ACTIVE" },
      },
    },
  };

  let statusCode = 200;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      assert.equal(statusCode, 403);
      assert.equal(body.error.code, "EMPLOYEE_ACCESS_DENIED");
      return this;
    },
  };

  let nextCalled = false;

  requireEmployeePermission("orders.view")(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
});
