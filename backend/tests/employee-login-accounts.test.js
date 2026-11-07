import test from "node:test";
import assert from "node:assert/strict";

import { createPendingEmployeeAccount } from "../src/services/employee-login-accounts.js";

const OWNER_ID = "owner-test-id";
const EMPLOYEE_ID = "employee-test-id";
const SHOP_ID = "shop-test-id";

// Create a fake database for testing.

function createMockDatabase({
  shopStatus = "ACTIVE",
  employeeExists = true,
  employeeActive = true,
  employeeRole = "DELIVERY_ASSOCIATE",
  email = "employee@example.com",
  existingUser = null,
  linkedUserId = null,
  employeeShopId = SHOP_ID,
  linkCount = 1,
} = {}) {
  const calls = {
    userCreated: false,
    employeeLinked: false,
    auditCreated: false,
  };

  const employee = employeeExists
    ? {
        id: EMPLOYEE_ID,
        shopId: employeeShopId,
        name: "Test Employee",
        email,
        mobile: "9876543210",
        isActive: employeeActive,
        employeeRole,
        userId: linkedUserId,
      }
    : null;

  const tx = {
    employee: {
      findFirst: async ({ where }) => {
        if (!employee) return null;

        if (employee.id !== where.id || employee.shopId !== where.shopId) {
          return null;
        }

        return employee;
      },

      updateMany: async () => {
        calls.employeeLinked = linkCount === 1;
        return { count: linkCount };
      },
    },

    user: {
      findFirst: async () => existingUser,

      create: async ({ data }) => {
        calls.userCreated = true;

        return {
          id: "new-user-test-id",
          email: data.email,
          role: data.role,
          isActive: data.isActive,
        };
      },
    },

    auditLog: {
      create: async () => {
        calls.auditCreated = true;
        return { id: "audit-test-id" };
      },
    },
  };

  const database = {
    shop: {
      findUnique: async () => ({
        id: SHOP_ID,
        status: shopStatus,
      }),
    },

    $transaction: async (callback) => callback(tx),
  };

  return { database, calls };
}

// TEST 1
test("Reject login creation for inactive shop", async () => {
  const { database, calls } = createMockDatabase({
    shopStatus: "INACTIVE",
  });

  await assert.rejects(
    createPendingEmployeeAccount(OWNER_ID, OWNER_ID, EMPLOYEE_ID, database),
    (error) => error.code === "SHOP_INACTIVE",
  );

  assert.equal(calls.userCreated, false);
});

// TEST 2
test("Reject employee without assigned role", async () => {
  const { database, calls } = createMockDatabase({
    employeeRole: null,
  });

  await assert.rejects(
    createPendingEmployeeAccount(OWNER_ID, OWNER_ID, EMPLOYEE_ID, database),
    (error) => error.code === "EMPLOYEE_ROLE_REQUIRED",
  );

  assert.equal(calls.userCreated, false);
});

// TEST 3
test("Reject duplicate email", async () => {
  const { database, calls } = createMockDatabase({
    existingUser: {
      id: "existing-user-id",
    },
  });

  await assert.rejects(
    createPendingEmployeeAccount(OWNER_ID, OWNER_ID, EMPLOYEE_ID, database),
    (error) => error.code === "EMPLOYEE_EMAIL_CONFLICT",
  );

  assert.equal(calls.userCreated, false);
});

// TEST 4
test("Create pending employee login account", async () => {
  const { database, calls } = createMockDatabase();

  const result = await createPendingEmployeeAccount(
    OWNER_ID,
    OWNER_ID,
    EMPLOYEE_ID,
    database,
  );

  assert.equal(result.role, "SHOP_EMPLOYEE");

  assert.equal(result.accountStatus, "PENDING_ACTIVATION");

  assert.equal(calls.userCreated, true);
  assert.equal(calls.employeeLinked, true);
  assert.equal(calls.auditCreated, true);
});

// TEST 5
test("Reject employee belonging to another shop", async () => {
  const { database, calls } = createMockDatabase({
    employeeShopId: "different-shop-id",
  });

  await assert.rejects(
    createPendingEmployeeAccount(OWNER_ID, OWNER_ID, EMPLOYEE_ID, database),
    (error) => error.code === "EMPLOYEE_NOT_FOUND",
  );

  assert.equal(calls.userCreated, false);
});

// TEST 6
test("Reject inactive employee", async () => {
  const { database, calls } = createMockDatabase({
    employeeActive: false,
  });

  await assert.rejects(
    createPendingEmployeeAccount(OWNER_ID, OWNER_ID, EMPLOYEE_ID, database),
    (error) => error.code === "EMPLOYEE_INACTIVE",
  );

  assert.equal(calls.userCreated, false);
});

// TEST 7
test("Reject employee without email", async () => {
  const { database, calls } = createMockDatabase({
    email: null,
  });

  await assert.rejects(
    createPendingEmployeeAccount(OWNER_ID, OWNER_ID, EMPLOYEE_ID, database),
    (error) => error.code === "EMPLOYEE_EMAIL_REQUIRED",
  );

  assert.equal(calls.userCreated, false);
});

// TEST 8
test("Reject employee with existing linked account", async () => {
  const { database, calls } = createMockDatabase({
    linkedUserId: "existing-linked-user-id",
  });

  await assert.rejects(
    createPendingEmployeeAccount(OWNER_ID, OWNER_ID, EMPLOYEE_ID, database),
    (error) => error.code === "EMPLOYEE_ACCOUNT_EXISTS",
  );

  assert.equal(calls.userCreated, false);
});

// TEST 9
test("Reject when employee login linkage fails", async () => {
  const { database, calls } = createMockDatabase({
    linkCount: 0,
  });

  await assert.rejects(
    createPendingEmployeeAccount(OWNER_ID, OWNER_ID, EMPLOYEE_ID, database),
    (error) => error.code === "EMPLOYEE_LINK_CONFLICT",
  );

  assert.equal(calls.employeeLinked, false);
  assert.equal(calls.auditCreated, false);
});
