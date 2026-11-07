import assert from "node:assert/strict";
import test from "node:test";
import {
  findPublicProduct,
  listBrands,
  listCategories,
  listProducts,
  listShops,
} from "../src/services/catalog.js";

test("public category and brand facets require active public products", async () => {
  const queries = [];

  const database = {
    category: {
      findMany: async (query) => {
        queries.push(query);
        return [];
      },
    },
    brand: {
      findMany: async (query) => {
        queries.push(query);
        return [];
      },
    },
  };

  await listCategories(database);
  await listBrands(database);

  assert.deepEqual(queries[0].where, {
    isActive: true,
    OR: [
      {
        products: {
          some: {
            status: "ACTIVE",
            shop: { status: "ACTIVE" },
            variants: { some: { isActive: true } },
          },
        },
      },
      {
        children: {
          some: {
            isActive: true,
            products: {
              some: {
                status: "ACTIVE",
                shop: { status: "ACTIVE" },
                variants: { some: { isActive: true } },
              },
            },
          },
        },
      },
    ],
  });

  assert.deepEqual(queries[1].where, {
    isActive: true,
    products: {
      some: {
        status: "ACTIVE",
        shop: { status: "ACTIVE" },
        variants: { some: { isActive: true } },
      },
    },
  });
});

test("public shop listing scopes active shops and returns stable pagination metadata", async () => {
  const whereUsed = [];

  const database = {
    shop: {
      findMany: async (query) => {
        whereUsed.push(query);
        return [{ id: "shop-1", name: "Active shop" }];
      },
      count: async ({ where }) => {
        whereUsed.push({ where });
        return 13;
      },
    },
  };

  const result = await listShops({ q: "market", page: 2, limit: 5 }, database);

  assert.equal(result.total, 13);
  assert.equal(result.pages, 3);

  assert.deepEqual(whereUsed[0].where, {
    status: "ACTIVE",
    products: {
      some: {
        status: "ACTIVE",
        variants: { some: { isActive: true } },
      },
    },
    name: { contains: "market", mode: "insensitive" },
  });

  assert.equal(whereUsed[0].skip, 5);
  assert.equal(whereUsed[0].take, 5);
});

test("public product list retains active shop, product and variant scope with paging", async () => {
  let findQuery;
  let countWhere;

  const database = {
    product: {
      findMany: async (query) => {
        findQuery = query;
        return [{ id: "product-1" }];
      },
      count: async ({ where }) => {
        countWhere = where;
        return 7;
      },
    },
    productReview: {
      groupBy: async () => [],
    },
  };

  const result = await listProducts(
    {
      q: "lamp",
      categoryId: "category-1",
      subcategoryId: "subcategory-1",
      brandId: undefined,
      shopId: undefined,
      sort: "newest",
      page: 2,
      limit: 3,
    },
    database,
  );

  assert.deepStrictEqual(result, {
    items: [
      {
        id: "product-1",
        averageRating: 0,
        reviewCount: 0,
      },
    ],
    page: 2,
    limit: 3,
    total: 7,
    pages: 3,
  });

  assert.deepEqual(findQuery.orderBy, [{ createdAt: "desc" }, { id: "asc" }]);

  assert.equal(findQuery.skip, 3);
  assert.equal(findQuery.take, 3);
  assert.equal(findQuery.where.status, "ACTIVE");
  assert.equal(findQuery.where.shop.status, "ACTIVE");

  assert.deepEqual(findQuery.where.variants, {
    some: { isActive: true },
  });

  assert.deepEqual(findQuery.where.category, {
    OR: [{ id: "category-1" }, { parentId: "category-1" }],
  });

  assert.equal(findQuery.where.categoryId, "subcategory-1");
  assert.equal(findQuery.where.OR.length, 5);
  assert.equal(countWhere, findQuery.where);
});

test("public product details cannot return inactive products or products from inactive shops", async () => {
  let whereUsed;

  const product = { id: "product-1" };

  const database = {
    product: {
      findFirst: async (query) => {
        whereUsed = query.where;
        return product;
      },
    },
    productReview: {
      groupBy: async () => [],
    },
  };

  const result = await findPublicProduct("product-1", database);

  assert.deepStrictEqual(result, {
    id: "product-1",
    averageRating: 0,
    reviewCount: 0,
  });

  assert.deepEqual(whereUsed, {
    id: "product-1",
    status: "ACTIVE",
    shop: { status: "ACTIVE" },
    variants: { some: { isActive: true } },
  });
});

test("price-sorted public products follow the database's effective-price order", async () => {
  let sqlQuery;
  let productQuery;

  const database = {
    $queryRaw: async (query) => {
      sqlQuery = query;
      return [{ id: "cheap" }, { id: "expensive" }];
    },
    product: {
      findMany: async (query) => {
        productQuery = query;
        return [{ id: "expensive" }, { id: "cheap" }];
      },
      count: async () => 2,
    },
    productReview: {
      groupBy: async () => [],
    },
  };

  const result = await listProducts(
    {
      q: "100% cotton",
      categoryId: "category-1",
      subcategoryId: "subcategory-1",
      brandId: undefined,
      shopId: undefined,
      sort: "price_asc",
      page: 1,
      limit: 24,
    },
    database,
  );

  assert.deepStrictEqual(result.items, [
    {
      id: "cheap",
      averageRating: 0,
      reviewCount: 0,
    },
    {
      id: "expensive",
      averageRating: 0,
      reviewCount: 0,
    },
  ]);

  assert.match(sqlQuery.sql, /ORDER BY "effectivePrice" ASC/);

  assert.deepEqual(productQuery.where.id, {
    in: ["cheap", "expensive"],
  });

  assert.equal(sqlQuery.values.includes("%100\\% cotton%"), true);

  assert.equal(sqlQuery.values.includes("category-1"), true);

  assert.equal(sqlQuery.values.includes("subcategory-1"), true);
});

test("public products return correct average rating and review count", async () => {
  let groupByQuery;

  const database = {
    product: {
      findMany: async () => [{ id: "product-1" }, { id: "product-2" }],
      count: async () => 2,
    },
    productReview: {
      groupBy: async (query) => {
        groupByQuery = query;

        return [
          {
            productId: "product-1",
            _avg: { rating: 4.5 },
            _count: { rating: 2 },
          },
          {
            productId: "product-2",
            _avg: { rating: 3 },
            _count: { rating: 1 },
          },
        ];
      },
    },
  };

  const result = await listProducts(
    {
      q: undefined,
      categoryId: undefined,
      subcategoryId: undefined,
      brandId: undefined,
      shopId: undefined,
      sort: "newest",
      page: 1,
      limit: 10,
    },
    database,
  );

  assert.deepStrictEqual(result.items, [
    {
      id: "product-1",
      averageRating: 4.5,
      reviewCount: 2,
    },
    {
      id: "product-2",
      averageRating: 3,
      reviewCount: 1,
    },
  ]);

  assert.deepEqual(groupByQuery.by, ["productId"]);

  assert.deepEqual(groupByQuery.where.productId.in, ["product-1", "product-2"]);
});
