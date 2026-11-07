import assert from "node:assert/strict";
import test from "node:test";
import { createAuthAccountService } from "../src/services/auth-accounts.js";

test("Auth account service requires active verified customer credentials", async () => {
  const service = createAuthAccountService({ user: { findUnique: async () => ({ id: "user-a", passwordHash: "hash", role: "CUSTOMER", isActive: true, emailVerifiedAt: null }) } }, { compare: async () => true });
  assert.equal(await service.authenticate("a@example.test", "password", "CUSTOMER"), null);
});

test("Auth password change hashes the password and increments session version", async () => {
  let update;
  const service = createAuthAccountService({ user: { update: async (query) => (update = query, { id: "user-a" }) } }, { hash: async (password, rounds) => `${password}:${rounds}` });
  await service.changePassword("user-a", "new-password");
  assert.equal(update.data.passwordHash, "new-password:12");
  assert.deepEqual(update.data.sessionVersion, { increment: 1 });
});
