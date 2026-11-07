import test from "node:test";
import assert from "node:assert/strict";

import { activateEmployeeAccount } from "../src/services/employee-password-activation.js";

const TEST_TOKEN = "test-activation-token";
const TEST_PASSWORD = "TestingPassword123!";

function createMockDatabase(activation = null) {
  const calls = {
    lookupCount: 0,
    transactionCount: 0,
  };

  const database = {
    employeeActivationToken: {
      findUnique: async () => {
        calls.lookupCount += 1;
        return activation;
      },
    },

    $transaction: async () => {
      calls.transactionCount += 1;
      throw new Error("Transaction should not execute.");
    },
  };

  return { database, calls };
}

function createActivation(overrides = {}) {
  return {
    id: "activation-test-id",
    userId: "employee-user-test-id",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: "employee-user-test-id",
      role: "SHOP_EMPLOYEE",
      isActive: false,
      passwordHash: null,
      employeeProfile: {
        id: "employee-test-id",
        isActive: true,
        employeeRole: "DELIVERY_ASSOCIATE",
        shop: {
          status: "ACTIVE",
        },
      },
    },
    ...overrides,
  };
}

async function expectInvalidActivation(activation) {
  const { database, calls } = createMockDatabase(activation);

  await assert.rejects(
    activateEmployeeAccount(TEST_TOKEN, TEST_PASSWORD, database),
    {
      code: "INVALID_ACTIVATION_LINK",
      status: 400,
    },
  );

  assert.equal(calls.lookupCount, 1);
  assert.equal(calls.transactionCount, 0);
}

test("Invalid activation token is rejected", async () => {
  await expectInvalidActivation(null);
});

test("Expired activation token is rejected", async () => {
  await expectInvalidActivation(
    createActivation({
      expiresAt: new Date(Date.now() - 60_000),
    }),
  );
});

test("Already-used activation token is rejected", async () => {
  await expectInvalidActivation(
    createActivation({
      usedAt: new Date(),
    }),
  );
});

test("Inactive employee is rejected", async () => {
  const activation = createActivation();
  activation.user.employeeProfile.isActive = false;

  await expectInvalidActivation(activation);
});

test("Inactive shop is rejected", async () => {
  const activation = createActivation();
  activation.user.employeeProfile.shop.status = "SUSPENDED";

  await expectInvalidActivation(activation);
});

test("Employee without role is rejected", async () => {
  const activation = createActivation();
  activation.user.employeeProfile.employeeRole = null;

  await expectInvalidActivation(activation);
});

test("Already activated account is rejected", async () => {
  const activation = createActivation();
  activation.user.isActive = true;

  await expectInvalidActivation(activation);
});

test("Missing linked user is rejected", async () => {
  await expectInvalidActivation(createActivation({ user: null }));
});
