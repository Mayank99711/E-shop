import assert from "node:assert/strict";
import test from "node:test";

import { createCustomerCommerceService } from "../src/services/customer-commerce.js";
import { createCustomerAccountService } from "../src/services/customer-account.js";
import { createCustomerOrdersService } from "../src/services/customer-orders.js";

// Mock for cart rating aggregation.
// Returns no reviews unless a test supplies rating results.
function createReviewMock(groups = []) {
  return {
    groupBy: async () => groups,
  };
}

test("customer favourites are scoped to the authenticated customer", async () => {
  let query;

  const service = createCustomerCommerceService({
    favourite: {
      findMany: async (value) => {
        query = value;
        return [];
      },
    },
  });

  assert.deepEqual(await service.getFavourites("customer-a"), []);
  assert.equal(query.where.customerId, "customer-a");
});

test("favourites reject inactive or missing products without creating a relation", async () => {
  let created = false;

  const service = createCustomerCommerceService({
    product: {
      findFirst: async ({ where }) => {
        assert.equal(where.shop.status, "ACTIVE");
        return null;
      },
    },
    favourite: {
      upsert: async () => {
        created = true;
      },
    },
  });

  assert.equal(await service.addFavourite("customer-a", "product-a"), null);
  assert.equal(created, false);
});

test("cart reads return an empty cart when none exists", async () => {
  const service = createCustomerCommerceService({
    $transaction: (callback) =>
      callback({
        cart: {
          findUnique: async () => null,
        },
      }),
  });

  assert.deepEqual(await service.readCart("customer-a"), {
    id: null,
    items: [],
  });
});

test("customer address defaults and address writes stay in one transaction", async () => {
  const calls = [];

  const tx = {
    address: {
      updateMany: async (query) => {
        calls.push(["clear", query]);
      },
      create: async (query) => {
        calls.push(["create", query]);
        return { id: "address-a" };
      },
    },
  };

  const service = createCustomerAccountService({
    $transaction: (callback) => callback(tx),
  });

  assert.deepEqual(
    await service.createAddress("customer-a", {
      label: "Home",
      isDefault: true,
    }),
    { id: "address-a" },
  );

  assert.equal(calls[0][1].where.customerId, "customer-a");
  assert.equal(calls[1][1].data.customerId, "customer-a");
});

test("customer order history is always scoped to its owner", async () => {
  let query;

  const service = createCustomerOrdersService({
    order: {
      findMany: async (value) => {
        query = value;
        return [];
      },
    },
  });

  assert.deepEqual(await service.list("customer-a"), []);
  assert.equal(query.where.customerId, "customer-a");
});

test("validateCheckoutCart reports an empty cart", async () => {
  const service = createCustomerCommerceService({
    $transaction: (callback) =>
      callback({
        cart: {
          findUnique: async () => null,
        },
      }),
  });

  const result = await service.validateCheckoutCart("customer-a");

  assert.equal(result.available, false);
  assert.deepEqual(result.items, []);
  assert.equal(result.issues[0].code, "CART_EMPTY");
});

test("validateCheckoutCart rejects unavailable products or variants", async () => {
  const service = createCustomerCommerceService({
    $transaction: (callback) =>
      callback({
        cart: {
          findUnique: async () => ({ id: "cart-a" }),
        },
        cartItem: {
          findMany: async () => [
            {
              id: "item-a",
              quantity: 1,
              productId: "product-a",
              variantId: "variant-a",
              product: {
                id: "product-a",
                status: "DRAFT",
              },
              variant: {
                id: "variant-a",
                price: 10,
                discountPrice: null,
                stock: 5,
                isActive: true,
                shop: { status: "ACTIVE" },
              },
            },
          ],
        },
        productReview: createReviewMock(),
      }),
  });

  const result = await service.validateCheckoutCart("customer-a");

  assert.equal(result.available, false);
  assert.equal(result.issues[0].code, "CART_ITEM_UNAVAILABLE");
});

test("validateCheckoutCart rejects insufficient stock", async () => {
  const service = createCustomerCommerceService({
    $transaction: (callback) =>
      callback({
        cart: {
          findUnique: async () => ({ id: "cart-a" }),
        },
        cartItem: {
          findMany: async () => [
            {
              id: "item-a",
              quantity: 3,
              productId: "product-a",
              variantId: "variant-a",
              product: {
                id: "product-a",
                status: "ACTIVE",
              },
              variant: {
                id: "variant-a",
                price: 10,
                discountPrice: null,
                stock: 2,
                isActive: true,
                shop: { status: "ACTIVE" },
              },
            },
          ],
        },
        productReview: createReviewMock(),
      }),
  });

  const result = await service.validateCheckoutCart("customer-a");

  assert.equal(result.available, false);
  assert.equal(result.issues[0].code, "CART_ITEM_UNAVAILABLE");
});

test("validateCheckoutCart uses trusted database prices for totals", async () => {
  const service = createCustomerCommerceService({
    $transaction: (callback) =>
      callback({
        cart: {
          findUnique: async () => ({ id: "cart-a" }),
        },
        cartItem: {
          findMany: async () => [
            {
              id: "item-a",
              quantity: 3,
              productId: "product-a",
              variantId: "variant-a",
              product: {
                id: "product-a",
                status: "ACTIVE",
              },
              variant: {
                id: "variant-a",
                price: 12.34,
                discountPrice: 10,
                stock: 5,
                isActive: true,
                shop: { status: "ACTIVE" },
              },
            },
          ],
        },
        productReview: createReviewMock(),
      }),
  });

  const result = await service.validateCheckoutCart("customer-a");

  assert.equal(result.available, true);
  assert.equal(result.issues.length, 0);
  assert.equal(result.items[0].unitPrice, 10);
  assert.equal(result.items[0].lineTotal, 30);
  assert.equal(result.total, 30);
});

test("validateCheckoutCart accepts a valid cart", async () => {
  const service = createCustomerCommerceService({
    $transaction: (callback) =>
      callback({
        cart: {
          findUnique: async () => ({ id: "cart-a" }),
        },
        cartItem: {
          findMany: async () => [
            {
              id: "item-a",
              quantity: 2,
              productId: "product-a",
              variantId: "variant-a",
              product: {
                id: "product-a",
                status: "ACTIVE",
              },
              variant: {
                id: "variant-a",
                price: 15,
                discountPrice: null,
                stock: 5,
                isActive: true,
                shop: { status: "ACTIVE" },
              },
            },
          ],
        },
        productReview: createReviewMock(),
      }),
  });

  const result = await service.validateCheckoutCart("customer-a");

  assert.equal(result.available, true);
  assert.equal(result.issues.length, 0);
  assert.equal(result.total, 30);
});

test("validateCheckoutCart is scoped to the requested customer", async () => {
  let queriedCustomerId;

  const service = createCustomerCommerceService({
    $transaction: (callback) =>
      callback({
        cart: {
          findUnique: async ({ where }) => {
            queriedCustomerId = where.customerId;
            return null;
          },
        },
      }),
  });

  await service.validateCheckoutCart("customer-42");

  assert.equal(queriedCustomerId, "customer-42");
});

// Additional test for Milestone 2.5.
test("cart reads include product average rating and review count", async () => {
  let ratingQuery;

  const transaction = {
    cart: {
      findUnique: async () => ({
        id: "cart-a",
      }),
    },

    cartItem: {
      findMany: async () => [
        {
          id: "item-a",
          quantity: 2,
          productId: "product-a",
          variantId: "variant-a",
          product: {
            id: "product-a",
            name: "Test Product",
            status: "ACTIVE",
          },
          variant: {
            id: "variant-a",
            price: 100,
            discountPrice: null,
            stock: 10,
            isActive: true,
            shop: {
              status: "ACTIVE",
            },
          },
        },
      ],
    },

    productReview: {
      groupBy: async (query) => {
        ratingQuery = query;

        return [
          {
            productId: "product-a",
            _avg: {
              rating: 4.5,
            },
            _count: {
              rating: 2,
            },
          },
        ];
      },
    },
  };

  const service = createCustomerCommerceService({
    $transaction: (callback) => callback(transaction),
  });

  const cart = await service.readCart("customer-a");

  assert.equal(cart.id, "cart-a");
  assert.equal(cart.items.length, 1);

  assert.equal(cart.items[0].product.averageRating, 4.5);

  assert.equal(cart.items[0].product.reviewCount, 2);

  assert.equal(cart.items[0].available, true);

  assert.deepEqual(ratingQuery.where.productId.in, ["product-a"]);
});
