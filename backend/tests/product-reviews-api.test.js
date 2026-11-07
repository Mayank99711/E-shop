import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import customerRouter from "../src/routes/customer.js";
import { prisma } from "../src/config/database.js";

const customerId = "9a6f9d2a-09a2-4e3a-a384-e920b1d2b185";
const productId = "171c0d47-170f-4f4d-8976-cf65b524ff2f";
const orderItemId = "b421b5f7-3058-4fb9-95a0-b84e0dc5a224";
const reviewId = "b8e63f26-503c-4a2d-a9a8-5505a9df8d3b";

test("customer review endpoints require auth and validate submissions before service calls", async () => {
  const originals = {
    userFindUnique: prisma.user.findUnique,
    orderItemFindFirst: prisma.orderItem.findFirst,
    reviewCreate: prisma.productReview.create,
    reviewFindMany: prisma.productReview.findMany,
    reviewCount: prisma.productReview.count,
    reviewUpdateMany: prisma.productReview.updateMany,
    reviewFindFirst: prisma.productReview.findFirst,
    reviewDeleteMany: prisma.productReview.deleteMany
  };
  let createdReviewData;
  let purchaseEligible = true;
  let duplicateSubmission = false;
  prisma.user.findUnique = async ({ where }) => ({
    id: where.id,
    role: "CUSTOMER",
    name: "Test customer",
    email: "customer@example.test",
    mobile: null,
    profileImageUrl: null,
    isActive: true,
    emailVerifiedAt: null,
    sessionVersion: 0,
    ownedShop: null
  });
  prisma.orderItem.findFirst = async () => purchaseEligible ? ({ id: orderItemId }) : null;
  prisma.productReview.create = async ({ data }) => {
    if (duplicateSubmission) {
      const error = new Error("Unique constraint failed");
      error.code = "P2002";
      error.meta = { target: ["orderItemId"] };
      throw error;
    }
    createdReviewData = data;
    return { id: "review-a", ...data, product: { id: productId, name: "Test product" } };
  };
  prisma.productReview.findMany = async () => [];
  prisma.productReview.count = async () => 0;
  prisma.productReview.updateMany = async () => ({ count: 1 });
  prisma.productReview.findFirst = async ({ where }) => ({
    id: where.id,
    customerId,
    product: { id: productId, name: "Test product" }
  });
  prisma.productReview.deleteMany = async () => ({ count: 1 });

  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.session = request.headers["x-test-customer"]
      ? { userId: request.headers["x-test-customer"], role: "CUSTOMER", sessionVersion: 0 }
      : {};
    next();
  });
  app.use("/api/customer", customerRouter);
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

  try {
    const url = `http://127.0.0.1:${server.address().port}/api/customer/reviews`;
    const unauthenticated = await fetch(url);
    assert.equal(unauthenticated.status, 401);

    const invalid = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-customer": customerId },
      body: JSON.stringify({ productId, orderItemId, rating: 0, title: "Test", comment: "Not valid" })
    });
    assert.equal(invalid.status, 400);
    assert.equal(createdReviewData, undefined);

    purchaseEligible = false;
    const ineligible = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-customer": customerId },
      body: JSON.stringify({ productId, orderItemId, rating: 5, title: "Test", comment: "Not eligible" })
    });
    assert.equal(ineligible.status, 403);
    assert.equal(createdReviewData, undefined);
    purchaseEligible = true;

    const created = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-customer": customerId },
      body: JSON.stringify({
        productId,
        orderItemId,
        customerId: "00000000-0000-0000-0000-000000000000",
        rating: 5,
        title: "  Excellent  ",
        comment: "Works exactly as expected."
      })
    });
    assert.equal(created.status, 201);
    assert.equal(createdReviewData.customerId, customerId);
    assert.equal(createdReviewData.title, "Excellent");
    const response = await created.json();
    assert.equal(response.review.product.id, productId);

    duplicateSubmission = true;
    const duplicate = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-customer": customerId },
      body: JSON.stringify({ productId, orderItemId, rating: 5, title: "Another review", comment: "Duplicate" })
    });
    assert.equal(duplicate.status, 409);

    const listed = await fetch(`${url}?page=1&limit=5`, {
      headers: { "x-test-customer": customerId }
    });
    assert.equal(listed.status, 200);
    assert.deepEqual(await listed.json(), { items: [], page: 1, limit: 5, total: 0, pages: 0 });

    const updated = await fetch(`${url}/${reviewId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-test-customer": customerId },
      body: JSON.stringify({ rating: 4 })
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).review.id, reviewId);

    const deleted = await fetch(`${url}/${reviewId}`, {
      method: "DELETE",
      headers: { "x-test-customer": customerId }
    });
    assert.equal(deleted.status, 204);
  } finally {
    prisma.user.findUnique = originals.userFindUnique;
    prisma.orderItem.findFirst = originals.orderItemFindFirst;
    prisma.productReview.create = originals.reviewCreate;
    prisma.productReview.findMany = originals.reviewFindMany;
    prisma.productReview.count = originals.reviewCount;
    prisma.productReview.updateMany = originals.reviewUpdateMany;
    prisma.productReview.findFirst = originals.reviewFindFirst;
    prisma.productReview.deleteMany = originals.reviewDeleteMany;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
