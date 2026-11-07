import { customerCommerceService } from "../services/customer-commerce.js";
import { customerCheckoutService } from "../services/customer-checkout.js";
import { customerAccountService } from "../services/customer-account.js";
import { customerOrdersService } from "../services/customer-orders.js";

function endpoint(handler) {
  return async (request, response, next) => {
    try { await handler(request, response); } catch (error) { next(error); }
  };
}

function createError(status, code, message) { return Object.assign(new Error(message), { status, code }); }

export const customerController = {
  customerCartItemsItemId_1: endpoint(async (req, res) => {
    const result = await customerCommerceService.updateCartItem(req.authUser.id, req.params.itemId, req.validatedBody.quantity);
    if (result.kind === "missing") throw createError(404, "CART_ITEM_NOT_FOUND", "Cart item not found.");
    if (result.kind === "stock") throw createError(409, "INSUFFICIENT_STOCK", "The requested quantity is not currently available.");
    res.json({ item: result.item });
  }),
  customerCartItemsItemId_2: endpoint(async (req, res) => {
    if (!await customerCommerceService.removeCartItem(req.authUser.id, req.params.itemId)) throw createError(404, "CART_ITEM_NOT_FOUND", "Cart item not found.");
    res.status(204).end();
  }),
  customerAddresses_3: endpoint(async (req, res) => res.json({ items: await customerAccountService.listAddresses(req.authUser.id) })),
  customerAddresses_4: endpoint(async (req, res) => res.status(201).json({ address: await customerAccountService.createAddress(req.authUser.id, req.validatedBody) })),
  customerAddressesAddressId_5: endpoint(async (req, res) => res.json({ address: await customerAccountService.updateAddress(req.authUser.id, req.params.addressId, req.validatedBody) })),
  customerAddressesAddressId_6: endpoint(async (req, res) => { await customerAccountService.deleteAddress(req.authUser.id, req.params.addressId); res.status(204).end(); }),
  customerOrders_7: endpoint(async (req, res) => res.json({ items: await customerOrdersService.list(req.authUser.id) })),
  customerOrdersOrderId_8: endpoint(async (req, res) => {
    const order = await customerOrdersService.get(req.authUser.id, req.params.orderId);
    if (!order) throw createError(404, "ORDER_NOT_FOUND", "Order not found.");
    res.json({ order });
  }),
  customerAccountDeletionRequest_9: endpoint(async (req, res) => res.json({ deletionRequest: await customerAccountService.getDeletionRequest(req.authUser.id) })),
  customerAccountDeletionRequest_10: endpoint(async (req, res) => {
    const result = await customerAccountService.requestDeletion(req.authUser.id, req.validatedBody.reason);
    res.status(result.created ? 202 : 200).json({ deletionRequest: result.deletionRequest });
  }),
  customerAccountDeletionRequest_11: endpoint(async (req, res) => res.json({ deletionRequest: await customerAccountService.cancelDeletion(req.authUser.id) })),
  customerCheckout_12: endpoint(async (request, response) => {
    const result = await customerCheckoutService.checkoutCod(request.authUser.id, request.validatedBody.addressId, request.validatedBody.idempotencyKey, false, request.validatedBody.couponCode);
    response.status(result.replayed ? 200 : 201).json({ order: result.order, replayed: result.replayed });
  }),
  customerCheckoutQuote_13: endpoint(async (request, response) => {
    const result = await customerCheckoutService.checkoutCod(request.authUser.id, request.validatedQuery.addressId, null, true, request.validatedQuery.couponCode);
    response.json(result.quote);
  })
};
