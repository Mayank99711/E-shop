import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

process.env.SESSION_SECRET ??= "owner-auth-test-session-secret-with-more-than-32-characters";

const [{ default: authRouter }, { prisma }] = await Promise.all([
  import("../src/routes/auth.js"),
  import("../src/config/database.js")
]);

function routeHandler(path) {
  const route = authRouter.stack.find((layer) => layer.route?.path === path)?.route;
  assert.ok(route, `Expected auth route ${path} to exist.`);
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers.length, 3);
  return handlers[2];
}

async function callEndpoint(handler, request) {
  let statusCode = 200;
  let body;
  let endpointError;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    }
  };

  await handler(request, response, (error) => {
    endpointError = error;
  });
  if (endpointError) throw endpointError;
  return { statusCode, body };
}

function parseRequest(routePath, body) {
  const route = authRouter.stack.find((layer) => layer.route?.path === routePath)?.route;
  const validation = route?.stack[1]?.handle;
  assert.equal(typeof validation, "function");

  const request = { body };
  let validationError;
  validation(request, {}, (error) => {
    validationError = error;
  });
  if (validationError) throw validationError;
  return request;
}

function replaceMethod(target, name, implementation, restore) {
  const original = target[name];
  target[name] = implementation;
  restore.push(() => {
    target[name] = original;
  });
}

test("owner invitation activation, password reset, and login complete successfully", async () => {
  const restore = [];
  const ownerId = "45ca06a1-7c94-4728-98e1-bd9d03424842";
  const activationToken = "a".repeat(64);
  const resetToken = "b".repeat(64);
  const owner = {
    id: ownerId,
    role: "SHOP_OWNER",
    name: "Test Owner",
    email: "owner@example.com",
    mobile: null,
    passwordHash: null,
    sessionVersion: 0,
    isActive: false,
    emailVerifiedAt: null
  };
  const activation = {
    id: "activation-token-id",
    userId: ownerId,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null
  };
  const reset = {
    id: "password-reset-token-id",
    userId: ownerId,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null
  };
  let ownedShop = { status: "ACTIVE" };
  let activationConsumed = false;
  let resetConsumed = false;

  const transaction = {
    ownerActivationToken: {
      async updateMany({ where, data }) {
        assert.ok(data.usedAt instanceof Date);
        if (where.id) {
          assert.equal(where.id, activation.id);
          if (!activationConsumed) activationConsumed = true;
          return { count: 1 };
        }
        return { count: 1 };
      }
    },
    passwordResetToken: {
      async updateMany({ where, data }) {
        assert.ok(data.usedAt instanceof Date);
        if (where.id) {
          assert.equal(where.id, reset.id);
          if (!resetConsumed) resetConsumed = true;
          return { count: 1 };
        }
        return { count: 1 };
      }
    },
    user: {
      async update({ where, data }) {
        assert.equal(where.id, ownerId);
        if (where.role) assert.equal(where.role, "SHOP_OWNER");
        const { sessionVersion, ...updatedFields } = data;
        Object.assign(owner, updatedFields);
        if (sessionVersion?.increment) owner.sessionVersion += sessionVersion.increment;
        else if (sessionVersion !== undefined) owner.sessionVersion = sessionVersion;
        return owner;
      }
    }
  };

  replaceMethod(prisma.ownerActivationToken, "findUnique", async ({ where }) => {
    assert.equal(where.tokenHash, createHash("sha256").update(activationToken).digest("hex"));
    return activation;
  }, restore);
  replaceMethod(prisma.passwordResetToken, "findUnique", async ({ where }) => {
    assert.equal(where.tokenHash, createHash("sha256").update(resetToken).digest("hex"));
    return reset;
  }, restore);
  replaceMethod(prisma.user, "findUnique", async () => ({ ...owner, ownedShop }), restore);
  replaceMethod(prisma, "$transaction", async (callback) => callback(transaction), restore);

  try {
    const activated = await callEndpoint(
      routeHandler("/activate-owner"),
      parseRequest("/activate-owner", { token: activationToken, password: "Initial-owner-pass-123" })
    );
    assert.equal(activated.statusCode, 200);
    assert.equal(activationConsumed, true);
    assert.equal(owner.isActive, true);
    assert.ok(owner.emailVerifiedAt instanceof Date);

    const resetResult = await callEndpoint(
      routeHandler("/reset-password"),
      parseRequest("/reset-password", { token: resetToken, password: "Updated-owner-pass-456" })
    );
    assert.equal(resetResult.statusCode, 200);
    assert.equal(resetConsumed, true);
    assert.equal(owner.sessionVersion, 2);

    ownedShop = { status: "PENDING" };
    const pendingShopRequest = parseRequest("/login", {
      email: owner.email,
      password: "Updated-owner-pass-456",
      role: "SHOP_OWNER"
    });
    const pendingShopLogin = await callEndpoint(routeHandler("/login"), pendingShopRequest);
    assert.equal(pendingShopLogin.statusCode, 401);

    ownedShop = null;
    const noShopRequest = parseRequest("/login", {
      email: owner.email,
      password: "Updated-owner-pass-456",
      role: "SHOP_OWNER"
    });
    const noShopLogin = await callEndpoint(routeHandler("/login"), noShopRequest);
    assert.equal(noShopLogin.statusCode, 401);

    ownedShop = { status: "ACTIVE" };
    const loginRequest = parseRequest("/login", {
      email: owner.email,
      password: "Updated-owner-pass-456",
      role: "SHOP_OWNER"
    });
    loginRequest.session = {
      regenerate(callback) { callback(null); },
      save(callback) { callback(null); }
    };
    const login = await callEndpoint(routeHandler("/login"), loginRequest);

    assert.equal(login.statusCode, 200);
    assert.equal(login.body.user.id, ownerId);
    assert.equal(login.body.user.role, "SHOP_OWNER");
    assert.equal(loginRequest.session.userId, ownerId);
    assert.equal(loginRequest.session.role, "SHOP_OWNER");

    const oldPasswordRequest = parseRequest("/login", {
      email: owner.email,
      password: "Initial-owner-pass-123",
      role: "SHOP_OWNER"
    });
    const rejectedOldPassword = await callEndpoint(routeHandler("/login"), oldPasswordRequest);
    assert.equal(rejectedOldPassword.statusCode, 401);
    assert.equal(rejectedOldPassword.body.error.code, "INVALID_CREDENTIALS");
  } finally {
    for (const restoreMethod of restore.reverse()) restoreMethod();
  }
});
