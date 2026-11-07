import assert from "node:assert/strict";
import test from "node:test";
import { createAdminOperationsService } from "../src/services/admin-operations.js";

test("admin operations queries return minimal employee and audit fields", async () => {
  let employeeQuery;
  let auditQuery;
  const service = createAdminOperationsService({
    employee: { findMany: async (query) => (employeeQuery = query, []) },
    auditLog: { findMany: async (query) => (auditQuery = query, []) },
  });

  await service.employees();
  await service.auditLogs();

  assert.equal(employeeQuery.take, 100);
  assert.deepEqual(employeeQuery.select, {
    id: true,
    employeeCode: true,
    name: true,
    designation: true,
    isActive: true,
    shop: { select: { id: true, name: true } },
  });
  assert.equal(auditQuery.select.metadata, undefined);
  assert.deepEqual(auditQuery.select.actor, { select: { name: true } });
});

test("admin product status changes are audited in the same transaction", async () => {
  const calls = [];
  const transaction = {
    product: {
      update: async ({ where, data }) => {
        calls.push(["update", where.id, data.status]);
        return { id: where.id, status: data.status };
      },
    },
    auditLog: {
      create: async ({ data }) => calls.push(["audit", data.actorId, data.targetId, data.metadata.status]),
    },
  };
  const service = createAdminOperationsService({
    product: { findUnique: async ({ where }) => ({ id: where.id }) },
    $transaction: (callback) => callback(transaction),
  });

  const result = await service.setProductStatus("product-1", "admin-1", "ARCHIVED");

  assert.deepEqual(result, { id: "product-1", status: "ARCHIVED" });
  assert.deepEqual(calls, [
    ["update", "product-1", "ARCHIVED"],
    ["audit", "admin-1", "product-1", "ARCHIVED"],
  ]);
});

test("admin product status rejects missing products without opening a transaction", async () => {
  let transactionStarted = false;
  const service = createAdminOperationsService({
    product: { findUnique: async () => null },
    $transaction: async () => { transactionStarted = true; },
  });

  await assert.rejects(service.setProductStatus("missing", "admin-1", "ACTIVE"), {
    status: 404,
    code: "PRODUCT_NOT_FOUND",
  });
  assert.equal(transactionStarted, false);
});
