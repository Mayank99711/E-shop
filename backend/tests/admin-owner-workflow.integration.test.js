import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";
import express from "express";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { removeProductImageFiles } from "../src/utils/product-images.js";

process.env.SESSION_SECRET ??= "admin-owner-integration-session-secret-with-more-than-32-characters";

const [{ default: adminRouter, createShopSchema }, { default: ownerRouter }, { prisma }, { env }] = await Promise.all([
  import("../src/routes/admin.js"),
  import("../src/routes/owner.js"),
  import("../src/config/database.js"),
  import("../src/config/env.js")
]);

const ids = {
  admin: "3d8156a8-d026-44f8-8572-cbf3e39ce0bc",
  owner: "b945f3ac-ae15-4d81-9eb3-2d640386de82",
  category: "7e84be4a-f242-46ce-a0ab-fbe69d64e8e8",
  attribute: "2d6725b8-bcd3-4335-910c-0319b04a4054",
  attributeValue: "7902f27d-d83b-4ce0-a0c2-267bb3f91a04",
  shop: "cae3eefa-bc41-4a2a-a9f1-0efc9b2c88ad",
  product: "7a2eb9fc-1dde-4375-a13d-643c22e90211",
  request: "9b90a232-048c-4c7f-9f35-9b147f5b88b2"
};
const uploadDirectory = fileURLToPath(new URL("../uploads/products/", import.meta.url));

function startSmtpSink() {
  const messages = [];
  const server = net.createServer((socket) => {
    let buffer = "";
    let receivingData = false;
    socket.write("220 localhost E-Shop integration test\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (buffer) {
        if (receivingData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          messages.push(buffer.slice(0, end));
          buffer = buffer.slice(end + 5);
          receivingData = false;
          socket.write("250 message accepted\r\n");
          continue;
        }
        const lineEnd = buffer.indexOf("\r\n");
        if (lineEnd === -1) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const command = line.split(/\s+/, 1)[0].toUpperCase();
        if (command === "EHLO" || command === "HELO") socket.write("250-localhost\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (command === "AUTH") socket.write("235 authenticated\r\n");
        else if (command === "MAIL" || command === "RCPT" || command === "RSET" || command === "NOOP") socket.write("250 ok\r\n");
        else if (command === "DATA") {
          receivingData = true;
          socket.write("354 end with dot\r\n");
        } else if (command === "QUIT") socket.write("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({
      server,
      messages,
      port: server.address().port
    }));
  });
}

function installPrismaFixture(restore, state) {
  const adminUser = {
    id: ids.admin, role: "SUPER_ADMIN", name: "Test Admin", email: "admin@example.test",
    mobile: null, profileImageUrl: null, isActive: true, emailVerifiedAt: new Date(),
    sessionVersion: 0, ownedShop: null
  };
  const ownerUser = {
    id: ids.owner, role: "SHOP_OWNER", name: "Test Owner", email: "new-owner@example.test",
    mobile: null, profileImageUrl: null, isActive: true, emailVerifiedAt: new Date(),
    sessionVersion: 0, ownedShop: { status: "ACTIVE" }
  };
  const shop = {
    id: ids.shop, ownerId: ids.owner, code: "SHOP-TEST", name: "Existing Test Shop",
    status: "ACTIVE", createdAt: new Date(), category: { id: ids.category, name: "Home" },
    businessName: null, businessType: null, taxId: null, gstNumber: null, panNumber: null,
    pinCode: null, city: null, district: null, state: null, country: null,
    businessAddress: null, contactPhone: null, contactEmail: null, logoUrl: null
  };
  const product = {
    id: ids.product, shopId: ids.shop, name: "Test Product", description: "Integration fixture",
    categoryId: ids.category, status: "ACTIVE"
  };
  const auditRows = [];
  const variants = [];
  const transaction = {
    user: {
      async create({ data }) {
        state.createdOwner = { id: ids.owner, ownerCode: data.ownerCode, name: data.name, email: data.email };
        return state.createdOwner;
      }
    },
    shop: {
      async create({ data }) {
        state.createdShop = { id: ids.shop, code: data.code, name: data.name, status: data.status };
        return state.createdShop;
      }
    },
    ownerActivationToken: {
      async create({ data }) {
        state.activationToken = data;
        return { id: "activation-token-id", ...data };
      }
    },
    product: {
      async create({ data }) {
        assert.equal(data.shopId, ids.shop);
        state.productCreated = true;
        return { ...product, name: data.name, description: data.description };
      }
    },
    productVariant: {
      async findMany({ where }) {
        return where.shopId
          ? variants.filter(({ sku }) => where.OR.some(({ sku: candidate }) => candidate.equals.toLowerCase() === sku.toLowerCase())).map(({ sku }) => ({ sku }))
          : variants.filter(({ productId }) => productId === where.productId).map(({ combinationKey }) => ({ combinationKey }));
      },
      async create({ data }) {
        const created = { id: randomUUID(), ...data };
        variants.push(created);
        return created;
      }
    },
    variantAttribute: {
      async findMany() { return [{ id: ids.attribute }]; }
    },
    variantAttributeValue: {
      async findMany() { return [{ id: ids.attributeValue, attributeId: ids.attribute }]; }
    },
    productImage: {
      async findMany() {
        return [...state.images];
      },
      async createMany({ data }) {
        state.images.push(...data.map((image, index) => ({ id: randomUUID(), ...image, position: image.position ?? state.images.length + index })));
        state.images.slice(-data.length).forEach(({ url }) => state.createdUploadPaths.push(path.join(uploadDirectory, path.basename(url))));
        return { count: data.length };
      },
      async findFirst() {
        return state.images[0] || null;
      },
      async delete({ where }) {
        const index = state.images.findIndex(({ id }) => id === where.id);
        const [deleted] = state.images.splice(index, 1);
        return deleted;
      },
      async update({ where, data }) {
        const image = state.images.find(({ id }) => id === where.id);
        Object.assign(image, data);
        return image;
      }
    },
    masterDataRequest: {
      async findUnique() {
        return state.pendingRequest;
      },
      async updateMany({ data }) {
        Object.assign(state.pendingRequest, data);
        return { count: 1 };
      }
    },
    category: {
      async findUnique() { return null; },
      async create({ data }) {
        state.approvedCategory = { id: randomUUID(), ...data };
        return state.approvedCategory;
      }
    },
    auditLog: {
      async create({ data }) {
        auditRows.push(data);
        return data;
      }
    },
    async $queryRaw() { return []; }
  };

  const replace = (target, key, implementation) => {
    const original = target[key];
    target[key] = implementation;
    restore.push(() => { target[key] = original; });
  };
  replace(prisma, "$transaction", (callback) => callback(transaction));
  replace(prisma.user, "findUnique", async ({ where }) => {
    if (where.email) return state.ownerAlreadyExists ? { id: ids.owner } : null;
    return where.id === ids.admin ? adminUser : where.id === ids.owner ? ownerUser : null;
  });
  replace(prisma.shop, "findUnique", async ({ where }) => where.ownerId === ids.owner ? shop : null);
  replace(prisma.shopCategory, "findFirst", async ({ where }) => where.id === ids.category && where.isActive ? { id: ids.category } : null);
  replace(prisma.category, "findFirst", async ({ where }) => where.id === ids.category && where.isActive ? { id: ids.category } : null);
  replace(prisma.brand, "findFirst", async () => null);
  replace(prisma.product, "findFirst", async ({ where }) => where.id === ids.product && where.shopId === ids.shop ? { id: ids.product } : null);
  replace(prisma.productImage, "findFirst", async ({ where }) => state.images.find((image) =>
    image.id === where.id && image.productId === where.productId
  ) || null);

  state.auditRows = auditRows;
  state.variants = variants;
}

test("admin shop invitation, approval, owner product, variants, and image APIs complete in an isolated HTTP fixture", async () => {
  const smtp = await startSmtpSink();
  const previousSmtp = env.smtp;
  env.smtp = {
    host: "127.0.0.1", port: smtp.port, user: "integration", password: "integration",
    from: "noreply@example.test"
  };
  const state = {
    images: [],
    createdUploadPaths: [],
    pendingRequest: {
      id: ids.request, type: "CATEGORY", proposedData: { name: "Outdoor Living", parentId: null },
      status: "PENDING"
    }
  };
  const restore = [];
  installPrismaFixture(restore, state);

  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    const role = request.header("x-test-role");
    request.session = {
      userId: role === "SUPER_ADMIN" ? ids.admin : ids.owner,
      role,
      sessionVersion: 0
    };
    next();
  });
  app.use("/uploads/products", express.static(uploadDirectory));
  app.use("/api/admin", adminRouter);
  app.use("/api/owner", ownerRouter);
  app.use((error, _request, response, _next) => {
    response.status(error.status || 500).json({
      error: { code: error.code || "INTERNAL_ERROR", message: error.message }
    });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const forbiddenAdminRequest = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { "x-test-role": "SHOP_OWNER" }
    });
    assert.equal(forbiddenAdminRequest.status, 403);
    const forbiddenOwnerRequest = await fetch(`${baseUrl}/api/owner/dashboard`, {
      headers: { "x-test-role": "SUPER_ADMIN" }
    });
    assert.equal(forbiddenOwnerRequest.status, 403);

    const createPayload = {
      shopName: "Integration Shop",
      shopCategoryId: ids.category,
      businessAddress: "1 Test Road",
      ownerFirstName: "New",
      ownerLastName: "Owner",
      ownerEmail: "new-owner@example.test"
    };
    assert.equal(createShopSchema.safeParse(createPayload).success, true);
    const createResponse = await fetch(`${baseUrl}/api/admin/shops`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-role": "SUPER_ADMIN" },
      body: JSON.stringify(createPayload)
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.shop.name, "Integration Shop");
    assert.equal(state.createdOwner.name, "New Owner");
    assert.equal(state.createdOwner.email, "new-owner@example.test");
    assert.equal(state.activationToken.userId, ids.owner);
    assert.ok(state.activationToken.tokenHash);
    assert.ok(smtp.messages.some((message) => message.includes("new-owner@example.test") && message.includes("activate-account")));

    const approvalResponse = await fetch(`${baseUrl}/api/admin/master-data-requests/${ids.request}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-test-role": "SUPER_ADMIN" },
      body: JSON.stringify({ decision: "APPROVED" })
    });
    assert.equal(approvalResponse.status, 200);
    const approval = await approvalResponse.json();
    assert.equal(approval.decision, "APPROVED");
    assert.equal(approval.approvedRecord.type, "CATEGORY");
    assert.equal(state.pendingRequest.status, "APPROVED");
    assert.equal(state.approvedCategory.normalizedName, "outdoor living");

    const productResponse = await fetch(`${baseUrl}/api/owner/products`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-role": "SHOP_OWNER" },
      body: JSON.stringify({
        name: "Test Product",
        description: "A fixture product",
        categoryId: ids.category,
        variants: [{ sku: "test-sku-1", price: "19.99", stock: 5, values: [] }]
      })
    });
    assert.equal(productResponse.status, 201);
    const createdProduct = await productResponse.json();
    assert.equal(createdProduct.product.id, ids.product);
    assert.equal(state.productCreated, true);
    assert.equal(state.variants[0].sku, "TEST-SKU-1");

    const secondVariantResponse = await fetch(`${baseUrl}/api/owner/products/${ids.product}/variants`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-role": "SHOP_OWNER" },
      body: JSON.stringify({
        variants: [{
          sku: "test-sku-2", price: "24.50", stock: 2,
          values: [{ attributeId: ids.attribute, valueId: ids.attributeValue }]
        }]
      })
    });
    const secondVariantBody = await secondVariantResponse.json();
    assert.equal(secondVariantResponse.status, 201, JSON.stringify(secondVariantBody));
    assert.equal(secondVariantBody.variants[0].sku, "TEST-SKU-2");

    const form = new FormData();
    form.append("images", new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" }), "fixture.png");
    const uploadResponse = await fetch(`${baseUrl}/api/owner/products/${ids.product}/images`, {
      method: "POST",
      headers: { "x-test-role": "SHOP_OWNER" },
      body: form
    });
    assert.equal(uploadResponse.status, 201);
    const uploaded = await uploadResponse.json();
    assert.equal(uploaded.images.length, 1);
    assert.match(uploaded.images[0].url, /^\/uploads\/products\/[0-9a-f-]+\.png$/i);
    await access(state.createdUploadPaths[0]);
    const publicImageResponse = await fetch(`${baseUrl}${uploaded.images[0].url}`);
    assert.equal(publicImageResponse.status, 200);
    assert.match(publicImageResponse.headers.get("content-type"), /image\/png/);
    assert.deepEqual(Buffer.from(await publicImageResponse.arrayBuffer()), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    const deleteResponse = await fetch(`${baseUrl}/api/owner/products/${ids.product}/images/${uploaded.images[0].id}`, {
      method: "DELETE",
      headers: { "x-test-role": "SHOP_OWNER" }
    });
    assert.equal(deleteResponse.status, 204);
    assert.equal(state.images.length, 0);
    await assert.rejects(access(state.createdUploadPaths[0]), { code: "ENOENT" });

    assert.ok(state.auditRows.some(({ action }) => action === "SHOP_CREATED"));
    assert.ok(state.auditRows.some(({ action }) => action === "MASTER_DATA_REQUEST_APPROVED"));
    assert.ok(state.auditRows.some(({ action }) => action === "PRODUCT_CREATED"));
    assert.ok(state.auditRows.some(({ action }) => action === "PRODUCT_IMAGES_UPLOADED"));
    assert.ok(state.auditRows.some(({ action }) => action === "PRODUCT_IMAGE_DELETED"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await removeProductImageFiles(state.createdUploadPaths);
    for (const restoreMethod of restore.reverse()) restoreMethod();
    env.smtp = previousSmtp;
    await new Promise((resolve) => smtp.server.close(resolve));
  }
});
