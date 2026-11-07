import { getOwnerShop, updateOwnerShopProfile } from "../services/owner-shop.js";

export const ownerShopController = {
  getProfile: async (request, response, next) => {
    try {
      response.json({ shop: await getOwnerShop(request.authUser.id) });
    } catch (error) {
      next(error);
    }
  },
  updateProfile: async (request, response, next) => {
    try {
      const shop = await updateOwnerShopProfile(request.authUser.id, request.authUser.id, request.validatedBody);
      response.json({ shop });
    } catch (error) {
      next(error);
    }
  }
};
