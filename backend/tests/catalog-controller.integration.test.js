import assert from "node:assert/strict";
import express from "express";
import test from "node:test";

const [{ catalogRouter }, { prisma }] = await Promise.all([
  import("../src/routes/customer.js"),
  import("../src/config/database.js")
]);

test("public catalog controller serves filtered product results through the HTTP route", async () => {
  const originals = {
    findMany: prisma.product.findMany,
    count: prisma.product.count
  };
  let query;
  prisma.product.findMany = async (options) => {
    query = options;
    return [{ id: "catalog-product", name: "Desk lamp" }];
  };
  prisma.product.count = async () => 1;

  const app = express();
  app.use("/api/catalog", catalogRouter);
  app.use((error, _request, response, _next) => {
    response.status(error.status || 500).json({ error: { code: error.code || "INTERNAL_ERROR", message: error.message } });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/catalog/products?q=desk&categoryId=9a6f9d2a-09a2-4e3a-a384-e920b1d2b185&subcategoryId=171c0d47-170f-4f4d-8976-cf65b524ff2f&sort=name_asc&page=2&limit=4`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      items: [{ id: "catalog-product", name: "Desk lamp" }],
      page: 2,
      limit: 4,
      total: 1,
      pages: 1
    });
    assert.equal(query.where.status, "ACTIVE");
    assert.equal(query.where.shop.status, "ACTIVE");
    assert.deepEqual(query.where.variants, { some: { isActive: true } });
    assert.equal(query.where.OR[0].name.contains, "desk");
    assert.deepEqual(query.where.category, {
      OR: [
        { id: "9a6f9d2a-09a2-4e3a-a384-e920b1d2b185" },
        { parentId: "9a6f9d2a-09a2-4e3a-a384-e920b1d2b185" }
      ]
    });
    assert.equal(query.where.categoryId, "171c0d47-170f-4f4d-8976-cf65b524ff2f");
  } finally {
    prisma.product.findMany = originals.findMany;
    prisma.product.count = originals.count;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
