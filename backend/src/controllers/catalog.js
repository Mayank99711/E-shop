import { findPublicProduct, listBrands, listCategories, listProducts, listShops } from "../services/catalog.js";

function endpoint(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response);
    } catch (error) {
      next(error);
    }
  };
}

export const catalogController = {
  categories: endpoint(async (_request, response) => {
    response.json({ items: await listCategories() });
  }),
  brands: endpoint(async (_request, response) => {
    response.json({ items: await listBrands() });
  }),
  shops: endpoint(async (request, response) => {
    const parsed = request.validatedQuery;
    response.json(await listShops(parsed));
  }),
  products: endpoint(async (request, response) => {
    response.json(await listProducts(request.validatedQuery));
  }),
  product: endpoint(async (request, response) => {
    const product = await findPublicProduct(request.params.productId);
    if (!product) {
      const error = new Error("This product is not available.");
      error.status = 404;
      error.code = "PRODUCT_NOT_FOUND";
      throw error;
    }
    response.json({ product });
  })
};
