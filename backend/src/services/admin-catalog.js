import { prisma } from "../config/database.js";

export function createAdminCatalogService(database = prisma) {
  return {
    listCategories: () => database.category.findMany({ orderBy: [{ parentId: "asc" }, { name: "asc" }], include: {
      _count: { select: { products: true, children: true } }, parent: { select: { id: true, name: true } }
    } }),
    listBrands: () => database.brand.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } }),
    listVariantAttributes: () => database.variantAttribute.findMany({ orderBy: { name: "asc" }, include: { values: { orderBy: { value: "asc" } } } })
  };
}

export const adminCatalogService = createAdminCatalogService();
