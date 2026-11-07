import { quoteCoupon, reserveCoupon } from "./coupons.js";
import { prisma } from "../config/database.js";
import { calculateShipping } from "./shipping-quote.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createCustomerCheckoutService(database = prisma) {
  return {
    checkoutCod: async (customerId, addressId, idempotencyKey, readOnly = false, couponCode = "") => {
      if (!readOnly && !idempotencyKey) throw fail(400, "IDEMPOTENCY_KEY_REQUIRED", "Checkout idempotency key is required.");

      if (!readOnly) {
        const existing = await database.order.findUnique({ where: { checkoutIdempotencyKey: idempotencyKey }, include: { shopOrders: { include: { items: true, statusHistory: true } }, payments: true } });
        if (existing) {
          if (existing.customerId !== customerId) throw fail(403, "FORBIDDEN", "This checkout key is not available to the current customer.");
          return { order: existing, replayed: true };
        }
      }

      const address = await database.address.findFirst({ where: { id: addressId, customerId } });
      if (!address) throw fail(400, "INVALID_ADDRESS", "Select a valid shipping address.");

      const cart = await database.cart.findUnique({ where: { customerId }, select: { id: true } });
      if (!cart) throw fail(400, "CART_EMPTY", "Your cart is empty.");
      const cartItems = await database.cartItem.findMany({
        where: { cartId: cart.id },
        include: {
          product: { select: { id: true, name: true, status: true, shopId: true, hsnCode: true, gstRate: true, taxInclusive: true, shop: { select: { id: true, name: true, status: true, state: true, city: true, pinCode: true, businessAddress: true, country: true } } } },
          variant: { select: { id: true, sku: true, price: true, discountPrice: true, stock: true, isActive: true,
            shippingWeightGrams: true, } }
        }
      });
      if (cartItems.length === 0) throw fail(400, "CART_EMPTY", "Your cart is empty.");

      const shopIds = new Set(cartItems.map((item) => item.product.shopId));
      if (shopIds.size > 1) throw fail(409, "MIXED_SHOP_CART", "Checkout supports one shop at a time. Please check out each shop separately.");

      const shop = cartItems[0].product.shop;
      if (shop.status !== "ACTIVE") throw fail(409, "SHOP_UNAVAILABLE", "The shop is not available for checkout.");
      const shopId = shop.id;

      const lines = [];
      for (const item of cartItems) {
        if (item.product.status !== "ACTIVE" || !item.variant.isActive) {
          throw fail(409, "CART_ITEM_UNAVAILABLE", "A cart item is no longer available.");
        }
        if (item.quantity > item.variant.stock) throw fail(409, "INSUFFICIENT_STOCK", "A cart item exceeds available stock.");
        const unitPrice = Number(item.variant.discountPrice ?? item.variant.price);
        const gstRateRaw = item.product.gstRate;
        if (gstRateRaw === null || gstRateRaw === undefined) throw fail(400, "TAX_CONFIG_MISSING", "Tax configuration is missing for a cart item.");
        const gstRate = Number(gstRateRaw);
        if (!Number.isFinite(gstRate) || gstRate < 0) throw fail(400, "TAX_CONFIG_MISSING", "Tax configuration is invalid for a cart item.");
        if (!shop.state) throw fail(400, "TAX_CONFIG_MISSING", `Seller tax state is missing for shop ${shop.name}. Update the shop business profile before checkout.`);
        if (!address.region) throw fail(400, "TAX_CONFIG_MISSING", "Shipping destination state is missing.");
        const taxInclusive = Boolean(item.product.taxInclusive);
        const lineSubtotal = unitPrice * item.quantity;
        let lineTax;
        if (taxInclusive) {
          lineTax = lineSubtotal - lineSubtotal / (1 + gstRate);
        } else {
          lineTax = lineSubtotal * gstRate;
        }
        const sameState = String(shop.state).trim().toLowerCase() === String(address.region).trim().toLowerCase();
        lines.push({ productId: item.productId, variantId: item.variantId, productName: item.product.name, shopName: shop.name, sku: item.variant.sku, unitPrice, quantity: item.quantity, lineTotal: lineSubtotal, gstRate, taxInclusive, hsnCode: item.product.hsnCode ?? null, taxAmount: lineTax, sameState });
      }

      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const taxTotal = lines.reduce((sum, line) => sum + line.taxAmount, 0);
      const exclusiveTaxTotal = lines.filter((line) => !line.taxInclusive).reduce((sum, line) => sum + line.taxAmount, 0);
      const couponQuote = await quoteCoupon(database, shopId, customerId, couponCode, subtotal);
      const discountTotal = couponQuote.discountTotal;
      const shippingQuote = await calculateShipping({ shop, address, cartItems, merchandiseSubtotal: subtotal });
      const deliveryTotal = shippingQuote.amount;
      const grandTotal = Math.round((Math.max(0, subtotal + exclusiveTaxTotal - discountTotal) + deliveryTotal) * 100) / 100;
      // Delivery quote calculated above on the server.
      const taxType = lines.every((line) => line.sameState) ? "CGST_SGST" : "IGST";
      if (readOnly) {
        return { quote: { subtotal, taxTotal, deliveryTotal, shippingQuote, grandTotal, discountTotal, couponCode: couponQuote.coupon?.code ?? null, taxType, currency: "INR" }, replayed: false };
      }

      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      try {
        const order = await database.$transaction(async (tx) => {
          for (const line of lines) {
            const updated = await tx.productVariant.updateMany({
              where: { id: line.variantId, stock: { gte: line.quantity } },
              data: { stock: { decrement: line.quantity } }
            });
            if (updated.count !== 1) throw fail(409, "INSUFFICIENT_STOCK", "A cart item exceeds available stock.");
          }

          const createdOrder = await tx.order.create({
            data: {
              orderNumber,
              customerId,
              addressId,
              status: "PLACED",
              subtotal,
              taxTotal,
              deliveryTotal,
              grandTotal,
              couponCode: couponQuote.coupon?.code ?? null,
              discountTotal,
              shippingSnapshot: { addressId, sellerState: shop.state, destinationState: address.region, taxType: lines.every((l) => l.sameState) ? "CGST_SGST" : "IGST", shippingCharge: deliveryTotal, shippingQuote },
              checkoutIdempotencyKey: idempotencyKey,
              shopOrders: {
                create: {
                  shopId,
                  status: "PLACED",
                  subtotal,
                  items: {
                    create: lines.map((line) => ({
                      productId: line.productId,
                      variantId: line.variantId,
                      productName: line.productName,
                      shopName: line.shopName,
                      sku: line.sku,
                      unitPrice: line.unitPrice,
                      quantity: line.quantity,
                       hsnCode: line.hsnCode,
                       gstRate: line.gstRate,
                       taxAmount: line.taxAmount
                    }))
                  },
                  statusHistory: { create: { status: "PLACED", note: "COD order created" } }
                }
              },
              payments: {
                create: { provider: "COD", status: "PENDING", amount: grandTotal }
              }
            },
            include: { shopOrders: { include: { items: true, statusHistory: true } }, payments: true }
          });

          await reserveCoupon(tx, couponQuote.coupon, customerId, createdOrder.id);
          await tx.cartItem.deleteMany({ where: { cartId: cart.id, variantId: { in: lines.map((l) => l.variantId) } } });

          await tx.auditLog.create({
            data: { actorId: customerId, action: "COD_CHECKOUT_CREATED", targetType: "ORDER", targetId: createdOrder.id, metadata: { shopId, grandTotal, idempotencyKey } }
          });

          return createdOrder;
        });
        return { order, replayed: false };
      } catch (error) {
        if (error.code === "P2002") {
          const replay = await database.order.findUnique({ where: { checkoutIdempotencyKey: idempotencyKey }, include: { shopOrders: { include: { items: true, statusHistory: true } }, payments: true } });
          if (replay && replay.customerId === customerId) return { order: replay, replayed: true };
        }
        throw error;
      }
    }
  };
}

export const customerCheckoutService = createCustomerCheckoutService();
