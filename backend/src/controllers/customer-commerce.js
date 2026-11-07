import { customerCommerceService } from "../services/customer-commerce.js";

function createError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function createCustomerCommerceController(service = customerCommerceService) {
  return {
    listFavourites: async (req, res, next) => { try { res.json({ items: await service.getFavourites(req.authUser.id) }); } catch (error) { next(error); } },
    addFavourite: async (req, res, next) => { try {
      const favourite = await service.addFavourite(req.authUser.id, req.params.productId);
      if (!favourite) throw createError(404, "PRODUCT_NOT_FOUND", "This product is not available.");
      res.status(201).json({ favourite });
    } catch (error) { next(error); } },
    removeFavourite: async (req, res, next) => { try { await service.removeFavourite(req.authUser.id, req.params.productId); res.status(204).end(); } catch (error) { next(error); } },
    getCart: async (req, res, next) => { try { res.json({ cart: await service.readCart(req.authUser.id) }); } catch (error) { next(error); } },
    addCartItem: async (req, res, next) => { try {
      const { variantId, quantity } = req.validatedBody;
      const result = await service.addCartItem(req.authUser.id, variantId, quantity);
      if (result.kind === "unavailable") throw createError(404, "VARIANT_NOT_AVAILABLE", "This product option is not available.");
      if (result.kind === "stock") throw createError(409, "INSUFFICIENT_STOCK", "The requested quantity exceeds current stock.");
      res.status(201).json({ item: result.item });
    } catch (error) { next(error); } }
  };
}

export const customerCommerceController = createCustomerCommerceController();
