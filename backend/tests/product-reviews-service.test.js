import assert from "node:assert/strict";
import test from "node:test";
import { createProductReviewsService } from "../src/services/product-reviews.js";

const input = {
  productId: "product-a",
  orderItemId: "order-item-a",
  rating: 5,
  title: "Excellent",
  comment: "Works exactly as expected."
};

test("review creation requires this customer's delivered order line for the same product", async () => {
  let eligibilityQuery;
  let createData;
  const service = createProductReviewsService({
    orderItem: {
      findFirst: async (query) => {
        eligibilityQuery = query;
        return { id: input.orderItemId };
      }
    },
    productReview: {
      create: async ({ data }) => (createData = data, { id: "review-a", ...data })
    }
  });

  const result = await service.create("customer-a", input);

  assert.equal(eligibilityQuery.where.id, input.orderItemId);
  assert.equal(eligibilityQuery.where.productId, input.productId);
  assert.equal(eligibilityQuery.where.shopOrder.status, "DELIVERED");
  assert.equal(eligibilityQuery.where.shopOrder.order.customerId, "customer-a");
  assert.equal(createData.customerId, "customer-a");
  assert.equal(createData.orderItemId, input.orderItemId);
  assert.equal(result.kind, "created");
});

test("review creation rejects an ineligible purchase without inserting a review", async () => {
  let inserted = false;
  const service = createProductReviewsService({
    orderItem: { findFirst: async () => null },
    productReview: { create: async () => { inserted = true; } }
  });

  assert.deepEqual(await service.create("customer-a", input), { kind: "ineligible" });
  assert.equal(inserted, false);
});

test("unique order-item constraint prevents duplicate reviews, including concurrent submissions", async () => {
  const service = createProductReviewsService({
    orderItem: { findFirst: async () => ({ id: input.orderItemId }) },
    productReview: {
      create: async () => {
        const error = new Error("Unique constraint failed");
        error.code = "P2002";
        error.meta = { target: ["orderItemId"] };
        throw error;
      }
    }
  });

  assert.deepEqual(await service.create("customer-a", input), { kind: "duplicate" });
});

test("customer review listing is scoped, ordered, and paginated", async () => {
  const calls = [];
  const service = createProductReviewsService({
    productReview: {
      findMany: async (query) => (calls.push(query), []),
      count: async (query) => (calls.push(query), 9)
    }
  });

  const result = await service.list("customer-a", { page: 2, limit: 4 });

  assert.equal(result.total, 9);
  assert.equal(result.pages, 3);
  assert.deepEqual(calls[0].where, { customerId: "customer-a" });
  assert.equal(calls[0].skip, 4);
  assert.equal(calls[0].take, 4);
  assert.deepEqual(calls[0].orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
});

test("review updates are scoped to the owning customer", async () => {
  let updateQuery;
  const updatedReview = { id: "review-a", customerId: "customer-a", title: "Updated" };
  const service = createProductReviewsService({
    productReview: {
      updateMany: async (query) => (updateQuery = query, { count: 1 }),
      findFirst: async () => updatedReview
    }
  });

  const result = await service.update("customer-a", "review-a", { title: "Updated" });

  assert.deepEqual(updateQuery.where, { id: "review-a", customerId: "customer-a" });
  assert.deepEqual(result, updatedReview);
});

test("a customer cannot update another customer's review", async () => {
  let readAfterUpdate = false;
  const service = createProductReviewsService({
    productReview: {
      updateMany: async ({ where }) => {
        assert.deepEqual(where, { id: "review-a", customerId: "customer-b" });
        return { count: 0 };
      },
      findFirst: async () => (readAfterUpdate = true, null)
    }
  });

  assert.equal(await service.update("customer-b", "review-a", { rating: 1 }), null);
  assert.equal(readAfterUpdate, false);
});

test("review deletion is scoped to the owning customer", async () => {
  let query;
  const service = createProductReviewsService({
    productReview: { deleteMany: async (value) => (query = value, { count: 1 }) }
  });

  assert.equal(await service.delete("customer-a", "review-a"), true);
  assert.deepEqual(query.where, { id: "review-a", customerId: "customer-a" });
});

test("a customer cannot delete another customer's review", async () => {
  const service = createProductReviewsService({
    productReview: {
      deleteMany: async ({ where }) => {
        assert.deepEqual(where, { id: "review-a", customerId: "customer-b" });
        return { count: 0 };
      }
    }
  });

  assert.equal(await service.delete("customer-b", "review-a"), false);
});
