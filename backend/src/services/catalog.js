import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";

export const productSelection = {
  id: true,
  name: true,
  description: true,
  status: true,
  createdAt: true,
  category: { select: { id: true, name: true, parentId: true } },
  brand: { select: { id: true, name: true } },
  shop: { select: { id: true, name: true, code: true, status: true } },
  images: {
    orderBy: { position: "asc" },
    select: { id: true, url: true, position: true },
  },
  variants: {
    where: { isActive: true },
    orderBy: { price: "asc" },
    select: {
      id: true,
      sku: true,
      price: true,
      discountPrice: true,
      stock: true,
      values: {
        select: {
          attribute: { select: { id: true, name: true } },
          value: { select: { id: true, value: true } },
        },
      },
    },
  },
};
export async function attachProductRatings(products, database = prisma) {
  if (!products.length) return [];

  const productIds = [...new Set(products.map((product) => product.id))];

  const ratingGroups = await database.productReview.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
    },
    _avg: {
      rating: true,
    },
    _count: {
      rating: true,
    },
  });

  const ratingsByProduct = new Map(
    ratingGroups.map((group) => [
      group.productId,
      {
        averageRating: Number((group._avg.rating ?? 0).toFixed(1)),
        reviewCount: group._count.rating,
      },
    ]),
  );

  return products.map((product) => ({
    ...product,
    averageRating: ratingsByProduct.get(product.id)?.averageRating ?? 0,
    reviewCount: ratingsByProduct.get(product.id)?.reviewCount ?? 0,
  }));
}

export async function listCategories(database = prisma) {
  return database.category.findMany({
    where: {
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
    },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true },
  });
}

export async function listBrands(database = prisma) {
  return database.brand.findMany({
    where: {
      isActive: true,
      products: {
        some: {
          status: "ACTIVE",
          shop: { status: "ACTIVE" },
          variants: { some: { isActive: true } },
        },
      },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listShops({ q, page, limit }, database = prisma) {
  const where = {
    status: "ACTIVE",
    products: {
      some: { status: "ACTIVE", variants: { some: { isActive: true } } },
    },
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    database.shop.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, code: true, name: true },
    }),
    database.shop.count({ where }),
  ]);
  return { items, page, limit, total, pages: Math.ceil(total / limit) };
}

function productWhere({ q, categoryId, subcategoryId, brandId, shopId }) {
  return {
    status: "ACTIVE",
    shop: { status: "ACTIVE" },
    variants: { some: { isActive: true } },
    ...(categoryId
      ? { category: { OR: [{ id: categoryId }, { parentId: categoryId }] } }
      : {}),
    ...(subcategoryId ? { categoryId: subcategoryId } : {}),
    ...(brandId ? { brandId } : {}),
    ...(shopId ? { shopId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { shop: { name: { contains: q, mode: "insensitive" } } },
            { category: { name: { contains: q, mode: "insensitive" } } },
            { brand: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

async function listProductsByPrice(filters, where, database) {
  const { q, categoryId, subcategoryId, brandId, shopId, sort, page, limit } =
    filters;
  const sqlFilters = [
    Prisma.sql`p."status" = 'ACTIVE'`,
    Prisma.sql`s."status" = 'ACTIVE'`,
    Prisma.sql`pv."isActive" = TRUE`,
  ];
  if (categoryId)
    sqlFilters.push(
      Prisma.sql`(p."categoryId" = ${categoryId}::uuid OR c."parentId" = ${categoryId}::uuid)`,
    );
  if (subcategoryId)
    sqlFilters.push(Prisma.sql`p."categoryId" = ${subcategoryId}::uuid`);
  if (brandId) sqlFilters.push(Prisma.sql`p."brandId" = ${brandId}::uuid`);
  if (shopId) sqlFilters.push(Prisma.sql`p."shopId" = ${shopId}::uuid`);
  if (q) {
    const escapedQuery = q.replace(/[\\%_]/g, "\\$&");
    const search = `%${escapedQuery}%`;
    sqlFilters.push(Prisma.sql`(
      p."name" ILIKE ${search} ESCAPE E'\\\\' OR
      p."description" ILIKE ${search} ESCAPE E'\\\\' OR
      s."name" ILIKE ${search} ESCAPE E'\\\\' OR
      c."name" ILIKE ${search} ESCAPE E'\\\\' OR
      b."name" ILIKE ${search} ESCAPE E'\\\\'
    )`);
  }
  const direction =
    sort === "price_asc" ? Prisma.raw("ASC") : Prisma.raw("DESC");
  const rows = await database.$queryRaw(Prisma.sql`
    SELECT p."id", MIN(COALESCE(pv."discountPrice", pv."price")) AS "effectivePrice"
    FROM "Product" p
    JOIN "Shop" s ON s."id" = p."shopId"
    JOIN "ProductVariant" pv ON pv."productId" = p."id"
    JOIN "Category" c ON c."id" = p."categoryId"
    LEFT JOIN "Brand" b ON b."id" = p."brandId"
    WHERE ${Prisma.join(sqlFilters, " AND ")}
    GROUP BY p."id"
    ORDER BY "effectivePrice" ${direction}, p."id" ASC
    LIMIT ${limit} OFFSET ${(page - 1) * limit}
  `);
  const found = await database.product.findMany({
    where: { ...where, id: { in: rows.map(({ id }) => id) } },
    select: productSelection,
  });
  const byId = new Map(found.map((product) => [product.id, product]));
  return rows.flatMap(({ id }) => (byId.has(id) ? [byId.get(id)] : []));
}

export async function listProducts(filters, database = prisma) {
  const where = productWhere(filters);
  const [items, total] = await Promise.all([
    filters.sort === "price_asc" || filters.sort === "price_desc"
      ? listProductsByPrice(filters, where, database)
      : database.product.findMany({
          where,
          orderBy:
            filters.sort === "name_asc"
              ? [{ name: "asc" }, { id: "asc" }]
              : filters.sort === "name_desc"
                ? [{ name: "desc" }, { id: "asc" }]
                : [{ createdAt: "desc" }, { id: "asc" }],
          skip: (filters.page - 1) * filters.limit,
          take: filters.limit,
          select: productSelection,
        }),
    database.product.count({ where }),
  ]);
  const productsWithRatings = await attachProductRatings(items, database);

  return {
    items: productsWithRatings,
    page: filters.page,
    limit: filters.limit,
    total,
    pages: Math.ceil(total / filters.limit),
  };
}

export async function findPublicProduct(productId, database = prisma) {
  const product = await database.product.findFirst({
    where: {
      id: productId,
      status: "ACTIVE",
      shop: { status: "ACTIVE" },
      variants: { some: { isActive: true } },
    },
    select: productSelection,
  });

  if (!product) return null;

  const [productWithRatings] = await attachProductRatings([product], database);

  return productWithRatings;
}
