import assert from "node:assert/strict";
import test from "node:test";
import { createAdminAccountRequestService } from "../src/services/admin-account-requests.js";

test("Admin account request review records the reviewer and audit event atomically", async () => {
  let update;
  let audit;
  const service = createAdminAccountRequestService({ $transaction: (callback) => callback({
    accountDeletionRequest: {
      updateMany: async (query) => (update = query, { count: 1 }),
      findUnique: async () => ({ id: "request-a", status: "APPROVED" })
    },
    auditLog: { create: async ({ data }) => { audit = data; } }
  }) });
  await service.review("request-a", "admin-a", "APPROVED", "verified");
  assert.equal(update.where.status, "PENDING");
  assert.equal(update.data.reviewerId, "admin-a");
  assert.equal(audit.actorId, "admin-a");
});

test("Admin account request review detects stale decisions", async () => {
  const service = createAdminAccountRequestService({ $transaction: (callback) => callback({
    accountDeletionRequest: { updateMany: async () => ({ count: 0 }), findUnique: async () => ({ id: "request-a" }) }
  }) });
  await assert.rejects(() => service.review("request-a", "admin-a", "REJECTED"), { code: "DELETION_REQUEST_NOT_PENDING" });
});
