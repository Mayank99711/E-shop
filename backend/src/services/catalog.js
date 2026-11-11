import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";

export const productSelection = {
  id: true,
  name: true,
  description: true,
  specifications: true,
  status: true,
  createdAt: true,
  category: { select: { id: true, name: true, parentId: true } },
  brand: { select: { id: true, name: true } },
  shop: { select: { id: true, name: true, code: true, status: true } },
  images: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      url: true,
      position: true,
      colorValueId: true,
      variantId: true,
      colorValue: {
        select: {
          id: true,
          value: true,
          attribute: {
            select: { name: true },
          },
        },
      },
    },
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
  const activeProductFilter = {
    status: "ACTIVE",
    shop: { status: "ACTIVE" },
    variants: {
      some: { isActive: true },
    },
  };

  // Start with categories containing available products.
  const productCategories = await database.category.findMany({
    where: {
      isActive: true,
      products: {
        some: activeProductFilter,
      },
    },
    select: {
      id: true,
      name: true,
      parentId: true,
    },
  });

  const categoryMap = new Map(
    productCategories.map((category) => [category.id, category]),
  );

  // Include all missing parent categories, up to the root.
  let parentIds = productCategories
    .map((category) => category.parentId)
    .filter(Boolean);

  while (parentIds.length > 0) {
    const missingIds = [
      ...new Set(parentIds.filter((id) => !categoryMap.has(id))),
    ];

    if (missingIds.length === 0) break;

    const parents = await database.category.findMany({
      where: {
        id: { in: missingIds },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        parentId: true,
      },
    });

    parentIds = [];

    for (const parent of parents) {
      categoryMap.set(parent.id, parent);

      if (parent.parentId) {
        parentIds.push(parent.parentId);
      }
    }

    if (parents.length === 0) break;
  }

  return [...categoryMap.values()].sort(
    (a, b) =>
      (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0) ||
      a.name.localeCompare(b.name),
  );
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
    select: {
      id: true,
      name: true,
      logoUrl: true,
      imageUrl: true,
    },
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
async function getCategoryDescendantIds(categoryId, database = prisma) {
  if (!categoryId) return [];

  const visited = new Set();
  let pendingIds = [categoryId];

  while (pendingIds.length > 0) {
    const currentIds = pendingIds.filter((id) => !visited.has(id));

    if (currentIds.length === 0) break;

    currentIds.forEach((id) => visited.add(id));

    const children = await database.category.findMany({
      where: {
        parentId: { in: currentIds },
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    pendingIds = children
      .map((category) => category.id)
      .filter((id) => !visited.has(id));
  }

  return [...visited];
}
function productWhere({ q, brandId, shopId }, categoryIds = []) {
  return {
    status: "ACTIVE",
    shop: { status: "ACTIVE" },
    variants: { some: { isActive: true } },

    ...(categoryIds.length > 0
      ? {
          categoryId: {
            in: categoryIds,
          },
        }
      : {}),

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

async function listProductsByPrice(filters, where, database, categoryIds = []) {
  const { q, categoryId, subcategoryId, brandId, shopId, sort, page, limit } =
    filters;
  const sqlFilters = [
    Prisma.sql`p."status" = 'ACTIVE'`,
    Prisma.sql`s."status" = 'ACTIVE'`,
    Prisma.sql`pv."isActive" = TRUE`,
  ];
  if (categoryIds.length > 0) {
    sqlFilters.push(
      Prisma.sql`p."categoryId" IN (${Prisma.join(
        categoryIds.map((id) => Prisma.sql`${id}::uuid`),
      )})`,
    );
  }
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
  const selectedCategoryId = filters.subcategoryId || filters.categoryId;

  const categoryIds = selectedCategoryId
    ? await getCategoryDescendantIds(selectedCategoryId, database)
    : [];

  const where = productWhere(filters, categoryIds);

  const [items, total] = await Promise.all([
    filters.sort === "price_asc" || filters.sort === "price_desc"
      ? listProductsByPrice(filters, where, database, categoryIds)
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
