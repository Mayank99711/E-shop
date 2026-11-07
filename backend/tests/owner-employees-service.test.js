import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerEmployeesService } from "../src/services/owner-employees.js";

test("Owner employee status updates are shop-scoped and audited transactionally", async () => {
  let query;
  let audit;
  const service = createOwnerEmployeesService({
    employee: { findFirst: async (value) => (query = value, { id: "employee-a" }) },
    $transaction: (callback) => callback({
      employee: { update: async () => ({ id: "employee-a", isActive: false }) },
      auditLog: { create: async ({ data }) => { audit = data; } }
    })
  }, async () => ({ id: "shop-a" }));
  assert.equal((await service.setActive("owner-a", "owner-a", "employee-a", false)).isActive, false);
  assert.equal(query.where.shopId, "shop-a");
  assert.equal(audit.actorId, "owner-a");
});

test("Owner salary operations cannot access an employee in another shop", async () => {
  const service = createOwnerEmployeesService({ employee: { findFirst: async () => null } }, async () => ({ id: "shop-a" }));
  await assert.rejects(() => service.salaryHistory("owner-a", "foreign-employee"), { code: "EMPLOYEE_NOT_FOUND" });
});
