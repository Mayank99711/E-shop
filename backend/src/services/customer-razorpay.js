import { prisma } from "../config/database.js";
import { calculateShipping } from "./shipping-quote.js";
import { env } from "../config/env.js";
import { quoteCoupon, reserveCoupon } from "./coupons.js";
import { createRazorpayProvider } from "./razorpay-provider.js";

const fail = (status, code, message) =>
  Object.assign(new Error(message), { status, code });

const provider = createRazorpayProvider({
  keyId: env.RAZORPAY_KEY_ID,
  keySecret: env.RAZORPAY_KEY_SECRET,
  webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
});

const paymentStatusRank = { PENDING: 0, FAILED: 1, AUTHORIZED: 2, PAID: 3 };
const webhookStatuses = {
  "payment.captured": "PAID",
  "payment.authorized": "AUTHORIZED",
  "payment.failed": "FAILED",
};

function providerStatus(status) {
  if (status === "captured") return "PAID";
  if (status === "authorized") return "AUTHORIZED";
  if (status === "failed") return "FAILED";
  if (status === "created") return "PENDING";
  throw fail(502, "PAYMENT_STATUS_UNSUPPORTED", "Razorpay returned an unsupported payment status.");
}

function validateProviderPayment(payment, orderId, paymentId, amount) {
  if (!payment || typeof payment !== "object") {
    throw fail(502, "PAYMENT_PROVIDER_RESPONSE_INVALID", "Razorpay returned invalid payment details.");
  }
  if (
    typeof paymentId !== "string" ||
    !paymentId ||
    payment.id !== paymentId ||
    payment.order_id !== orderId ||
    payment.currency !== "INR" ||
    Number(payment.amount) !== Math.round(Number(amount) * 100)
  ) {
    throw fail(409, "PAYMENT_DETAILS_MISMATCH", "The provider payment does not match this order.");
  }
}

async function persistVerifiedPayment(transaction, payment, providerPaymentId, nextStatus, actorId, verificationEvidence = null) {
  const current = await transaction.payment.findUnique({
    where: { id: payment.id },
    select: { id: true, orderId: true, providerPaymentId: true, status: true },
  });
  if (!current) throw fail(404, "PAYMENT_NOT_FOUND", "Payment not found.");
  if (current.status === "REFUND_PENDING" || current.status === "REFUNDED") {
    throw fail(409, "PAYMENT_STATE_FINAL", "A refunded payment cannot be changed by checkout verification.");
  }
  if (current.providerPaymentId && current.providerPaymentId !== providerPaymentId) {
    throw fail(409, "PAYMENT_ATTEMPT_MISMATCH", "A different provider payment is already linked to this order.");
  }

  const status =
    paymentStatusRank[nextStatus] > paymentStatusRank[current.status]
      ? nextStatus
      : current.status;
  const data = {
    providerPaymentId,
    providerReference: providerPaymentId,
    ...(status !== "PENDING" ? { status, verifiedAt: new Date() } : {}),
  };
  let stateChanged = false;

  if (current.providerPaymentId !== providerPaymentId || current.status !== status) {
    const changed = await transaction.payment.updateMany({
      where: {
        id: payment.id,
        status: current.status,
        providerPaymentId: current.providerPaymentId,
      },
      data,
    });
    if (changed.count === 1 && current.status !== status) stateChanged = true;
    if (changed.count !== 1) {
      const latest = await transaction.payment.findUnique({
        where: { id: payment.id },
        select: { id: true, orderId: true, providerPaymentId: true, status: true },
      });
      if (!latest) throw fail(404, "PAYMENT_NOT_FOUND", "Payment not found.");
      if (latest.providerPaymentId && latest.providerPaymentId !== providerPaymentId) {
        throw fail(409, "PAYMENT_ATTEMPT_MISMATCH", "A different provider payment is already linked to this order.");
      }
      if (paymentStatusRank[nextStatus] > paymentStatusRank[latest.status]) {
        const retried = await transaction.payment.updateMany({
          where: {
            id: payment.id,
            status: latest.status,
            providerPaymentId: latest.providerPaymentId,
          },
          data: { ...data, status: nextStatus },
        });
        if (retried.count !== 1) {
          throw fail(409, "PAYMENT_STATE_CHANGED", "The payment changed during verification. Retry the request.");
        }
        stateChanged = latest.status !== nextStatus;
      }
    }
  }

  if (actorId && stateChanged) {
    await transaction.auditLog.create({
      data: {
        actorId,
        action: verificationEvidence ? "RAZORPAY_PAYMENT_RECONCILED" : "RAZORPAY_PAYMENT_STATUS_VERIFIED",
        targetType: "PAYMENT",
        targetId: payment.id,
        metadata: {
          status,
          providerPaymentId,
          ...(verificationEvidence ? { verificationSource: "RAZORPAY_TEST_API", ...verificationEvidence } : {}),
        },
      },
    });
  }

  if (status === "PAID" || nextStatus === "PAID") {
    await transaction.inventoryReservation.updateMany({
      where: { orderId: current.orderId, status: "ACTIVE" },
      data: { status: "CONVERTED" },
    });
    const order = await transaction.order.findUnique({
      where: { id: current.orderId },
      select: {
        customerId: true,
        shopOrders: {
          select: {
            items: { select: { variantId: true, quantity: true } },
          },
        },
      },
    });
    if (order) {
      const cart = await transaction.cart.findUnique({
        where: { customerId: order.customerId },
        select: { id: true },
      });
      if (cart) {
        const purchasedItems = order.shopOrders.flatMap(({ items }) => items);
        for (const item of purchasedItems) {
          if (!item.variantId) continue;
          await transaction.cartItem.deleteMany({
            where: {
              cartId: cart.id,
              variantId: item.variantId,
              quantity: item.quantity,
            },
          });
        }
      }
    }
  }

  const result = await transaction.payment.findUnique({
    where: { id: payment.id },
    select: { id: true, status: true, providerPaymentId: true },
  });
  return result;
}

export function createCustomerRazorpayService(database = prisma, paymentProvider = provider) {
  return {
    initiate: async (customerId, addressId, idempotencyKey, couponCode = "") => {
      if (!idempotencyKey) {
        throw fail(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Checkout idempotency key is required.",
        );
      }

      if (!paymentProvider.configured) {
        throw fail(
          503,
          "RAZORPAY_NOT_CONFIGURED",
          "Razorpay is not configured.",
        );
      }

      // Return an existing checkout when the same key is reused.
      const existing = await database.order.findUnique({
        where: {
          checkoutIdempotencyKey: idempotencyKey,
        },
        include: {
          shopOrders: { include: { items: true } },
          payments: true,
        },
      });

      if (existing) {
        if (existing.customerId !== customerId) {
          throw fail(403, "FORBIDDEN", "This checkout key is not available.");
        }

        const razorpayOrderId = existing.payments?.[0]?.providerOrderId;

        return {
          order: existing,
          razorpayOrderId,
          amount: Math.round(Number(existing.grandTotal) * 100),
          currency: "INR",
          keyId: env.RAZORPAY_KEY_ID,
          replayed: true,
        };
      }

      // Validate the customer's shipping address.
      const address = await database.address.findFirst({
        where: {
          id: addressId,
          customerId,
        },
      });

      if (!address) {
        throw fail(400, "INVALID_ADDRESS", "Select a valid shipping address.");
      }

      // Load the customer's cart.
      const cart = await database.cart.findUnique({
        where: { customerId },
        select: { id: true },
      });

      if (!cart) {
        throw fail(400, "CART_EMPTY", "Your cart is empty.");
      }

      const cartItems = await database.cartItem.findMany({
        where: { cartId: cart.id },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              status: true,
              shopId: true,
              hsnCode: true,
              gstRate: true,
              taxInclusive: true,
              shop: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  state: true, city: true, pinCode: true, businessAddress: true, country: true,
                },
              },
            },
          },
          variant: {
            select: {
              id: true,
              sku: true,
              price: true,
              discountPrice: true,
              stock: true,
              isActive: true,
            shippingWeightGrams: true,
            },
          },
        },
      });

      if (cartItems.length === 0) {
        throw fail(400, "CART_EMPTY", "Your cart is empty.");
      }

      // Checkout currently supports one shop per order.
      const shopIds = new Set(cartItems.map((item) => item.product.shopId));

      if (shopIds.size > 1) {
        throw fail(
          409,
          "MIXED_SHOP_CART",
          "Checkout supports one shop at a time.",
        );
      }

      const shop = cartItems[0].product.shop;
      const shopId = shop.id;

      if (!shop || shop.status !== "ACTIVE") {
        throw fail(
          409,
          "SHOP_UNAVAILABLE",
          "The shop is not available for checkout.",
        );
      }

      // Validate items and calculate line totals.
      const lines = [];

      for (const item of cartItems) {
        if (
          !item.product ||
          !item.variant ||
          item.product.status !== "ACTIVE" ||
          !item.variant.isActive
        ) {
          throw fail(
            409,
            "CART_ITEM_UNAVAILABLE",
            "A cart item is no longer available.",
          );
        }

        if (item.quantity > item.variant.stock) {
          throw fail(
            409,
            "INSUFFICIENT_STOCK",
            "A cart item exceeds available stock.",
          );
        }

        const unitPrice = Number(
          item.variant.discountPrice ?? item.variant.price,
        );

        const gstRateRaw = item.product.gstRate;
        if (gstRateRaw === null || gstRateRaw === undefined) throw fail(400, "TAX_CONFIG_MISSING", "Tax configuration is missing for a cart item.");
        const gstRate = Number(gstRateRaw);
        if (!Number.isFinite(gstRate) || gstRate < 0) throw fail(400, "TAX_CONFIG_MISSING", "Tax configuration is invalid for a cart item.");
        if (!shop.state) throw fail(400, "TAX_CONFIG_MISSING", "Seller tax state is missing.");
        if (!address.region) throw fail(400, "TAX_CONFIG_MISSING", "Shipping destination state is missing.");
        const taxInclusive = Boolean(item.product.taxInclusive);
        const lineSubtotal = unitPrice * item.quantity;
        const lineTax = taxInclusive ? lineSubtotal - lineSubtotal / (1 + gstRate) : lineSubtotal * gstRate;
        const sameState = String(shop.state).trim().toLowerCase() === String(address.region).trim().toLowerCase();

        lines.push({
          productId: item.productId,
          variantId: item.variantId,
          productName: item.product.name,
          shopName: shop.name,
          sku: item.variant.sku,
          unitPrice,
          quantity: item.quantity,
          lineTotal: lineSubtotal,
          gstRate,
          taxInclusive,
          hsnCode: item.product.hsnCode ?? null,
          taxAmount: lineTax,
          sameState,
        });
      }

      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const taxTotal = lines.reduce((sum, line) => sum + line.taxAmount, 0);
      const exclusiveTaxTotal = lines.filter((line) => !line.taxInclusive).reduce((sum, line) => sum + line.taxAmount, 0);
      const couponQuote = await quoteCoupon(database, shopId, customerId, couponCode, subtotal);
      const discountTotal = couponQuote.discountTotal;
      const shippingQuote = await calculateShipping({ shop, address, cartItems, merchandiseSubtotal: subtotal });
      const deliveryTotal = shippingQuote.amount;
      const grandTotal = Math.round((Math.max(0, subtotal + exclusiveTaxTotal - discountTotal) + deliveryTotal) * 100) / 100;

      if (grandTotal < 1) throw fail(400, 'RAZORPAY_MIN_AMOUNT', 'Razorpay requires a payable amount of at least INR 1. Please use COD or a smaller discount.');
      // Delivery quote calculated above on the server.

      const orderNumber = `ORD-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      try {
        const result = await database.$transaction(async (tx) => {
          // Reserve inventory atomically.
          for (const line of lines) {
            const updated = await tx.productVariant.updateMany({
              where: {
                id: line.variantId,
                stock: { gte: line.quantity },
              },
              data: {
                stock: { decrement: line.quantity },
              },
            });

            if (updated.count !== 1) {
              throw fail(
                409,
                "INSUFFICIENT_STOCK",
                "A cart item exceeds available stock.",
              );
            }

            await tx.inventoryReservation.create({
              data: {
                shopId: shop.id,
                productVariantId: line.variantId,
                quantity: line.quantity,
                status: "ACTIVE",
                expiresAt,
                checkoutIdempotencyKey: idempotencyKey,
              },
            });
          }

          const order = await tx.order.create({
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
              shippingSnapshot: {
                addressId,
                sellerState: shop.state,
                destinationState: address.region,
                taxType: lines.every((line) => line.sameState) ? "CGST_SGST" : "IGST",
                shippingCharge: deliveryTotal, shippingQuote,
              },
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
                      taxAmount: line.taxAmount,
                    })),
                  },
                  statusHistory: {
                    create: {
                      status: "PLACED",
                      note: "Razorpay order created",
                    },
                  },
                },
              },
              payments: {
                create: {
                  provider: "RAZORPAY",
                  status: "PENDING",
                  amount: grandTotal,
                },
              },
            },
            include: {
              shopOrders: { include: { items: true } },
              payments: true,
            },
          });

          await tx.inventoryReservation.updateMany({
            where: {
              checkoutIdempotencyKey: idempotencyKey,
              orderId: null,
            },
            data: {
              orderId: order.id,
            },
          });

          await reserveCoupon(tx, couponQuote.coupon, customerId, order.id);
          const payment = order.payments[0];

          // Create the Razorpay order.
          const razorpayOrder = await paymentProvider.createOrder({
            amount: grandTotal,
            currency: "INR",
            receipt: order.id,
            notes: {
              orderId: order.id,
            },
          });

          await tx.payment.update({
            where: { id: payment.id },
            data: {
              providerOrderId: razorpayOrder.id,
              providerReference: razorpayOrder.id,
            },
          });

          await tx.auditLog.create({
            data: {
              actorId: customerId,
              action: "RAZORPAY_CHECKOUT_INITIATED",
              targetType: "ORDER",
              targetId: order.id,
              metadata: {
                idempotencyKey,
                razorpayOrderId: razorpayOrder.id,
              },
            },
          });

          return {
            order: {
              ...order,
              payments: [
                {
                  ...payment,
                  providerOrderId: razorpayOrder.id,
                  providerReference: razorpayOrder.id,
                },
              ],
            },
            razorpayOrderId: razorpayOrder.id,
            amount: Math.round(grandTotal * 100),
            currency: "INR",
          };
        });

        return {
          ...result,
          keyId: env.RAZORPAY_KEY_ID,
          replayed: false,
        };
      } catch (error) {
        // Handle a duplicate checkout idempotency key.
        if (error.code === "P2002") {
          const replay = await database.order.findUnique({
            where: {
              checkoutIdempotencyKey: idempotencyKey,
            },
            include: {
              shopOrders: { include: { items: true } },
              payments: true,
            },
          });

          if (replay && replay.customerId === customerId) {
            return {
              order: replay,
              razorpayOrderId: replay.payments?.[0]?.providerOrderId,
              amount: Math.round(Number(replay.grandTotal) * 100),
              currency: "INR",
              keyId: env.RAZORPAY_KEY_ID,
              replayed: true,
            };
          }
        }

        throw error;
      }
    },
    verifyPayment: async (customerId, details) => {
      if (!paymentProvider.verifyCheckoutSignature(details)) {
        throw fail(400, "PAYMENT_SIGNATURE_INVALID", "Razorpay payment signature is invalid.");
      }

      const payment = await database.payment.findFirst({
        where: { provider: "RAZORPAY", providerOrderId: details.razorpayOrderId },
        include: {
          order: {
            select: { id: true, orderNumber: true, customerId: true },
          },
        },
      });
      if (!payment || payment.order.customerId !== customerId) {
        throw fail(404, "PAYMENT_NOT_FOUND", "Payment not found.");
      }

      const providerPayment = await paymentProvider.fetchPayment(details.razorpayPaymentId);
      validateProviderPayment(
        providerPayment,
        details.razorpayOrderId,
        details.razorpayPaymentId,
        payment.amount,
      );
      const status = providerStatus(providerPayment.status);
      const savedPayment = await database.$transaction((transaction) =>
        persistVerifiedPayment(transaction, payment, providerPayment.id, status, customerId),
      );

      return {
        payment: savedPayment,
        order: { id: payment.order.id, orderNumber: payment.order.orderNumber },
      };
    },
    reconcileTestPayment: async (orderId, actorId) => {
      if (!paymentProvider.configured || !paymentProvider.testMode) {
        throw fail(403, "TEST_RECONCILIATION_UNAVAILABLE", "Provider API reconciliation is restricted to configured Razorpay TEST mode.");
      }
      if (typeof paymentProvider.fetchOrder !== "function" || typeof paymentProvider.fetchOrderPayments !== "function") {
        throw fail(503, "PROVIDER_RECONCILIATION_UNAVAILABLE", "Razorpay order reconciliation is unavailable.");
      }

      const order = await database.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          grandTotal: true,
          payments: {
            where: { provider: "RAZORPAY" },
            select: { id: true, orderId: true, provider: true, amount: true, status: true, providerOrderId: true, providerPaymentId: true },
          },
        },
      });
      if (!order) throw fail(404, "ORDER_NOT_FOUND", "Order not found.");
      if (order.payments.length !== 1) {
        throw fail(409, "PAYMENT_MAPPING_AMBIGUOUS", "Order must have exactly one linked Razorpay payment.");
      }
      const payment = order.payments[0];
      if (payment.orderId !== order.id || !payment.providerOrderId || Number(payment.amount) !== Number(order.grandTotal)) {
        throw fail(409, "PAYMENT_MAPPING_MISMATCH", "The local order and Razorpay payment mapping is inconsistent.");
      }

      const providerOrder = await paymentProvider.fetchOrder(payment.providerOrderId);
      if (!providerOrder || typeof providerOrder !== "object") {
        throw fail(502, "PAYMENT_PROVIDER_RESPONSE_INVALID", "Razorpay returned invalid order details.");
      }
      if (
        providerOrder.id !== payment.providerOrderId ||
        providerOrder.receipt !== order.id ||
        providerOrder.notes?.orderId !== order.id ||
        providerOrder.currency !== "INR" ||
        Number(providerOrder.amount) !== Math.round(Number(payment.amount) * 100)
      ) {
        throw fail(409, "PAYMENT_DETAILS_MISMATCH", "The Razorpay order does not match this local order.");
      }
      if (providerOrder.status !== "paid") {
        throw fail(409, "PAYMENT_NOT_CAPTURED", "Razorpay has not marked this order as paid.");
      }

      const providerPayments = await paymentProvider.fetchOrderPayments(payment.providerOrderId);
      if (!Array.isArray(providerPayments)) {
        throw fail(502, "PAYMENT_PROVIDER_RESPONSE_INVALID", "Razorpay returned invalid payment details.");
      }
      const capturedPayments = providerPayments.filter((item) =>
        item.order_id === payment.providerOrderId && item.status === "captured" && item.captured === true
      );
      if (capturedPayments.length !== 1) {
        throw fail(409, "CAPTURED_PAYMENT_AMBIGUOUS", "Razorpay must return exactly one captured payment for this order.");
      }
      const capturedPayment = capturedPayments[0];
      validateProviderPayment(capturedPayment, payment.providerOrderId, capturedPayment.id, payment.amount);
      if (Number(capturedPayment.amount_refunded || 0) !== 0) {
        throw fail(409, "PAYMENT_ALREADY_REFUNDED", "A refunded payment cannot be reconciled as paid.");
      }
      if (providerStatus(capturedPayment.status) !== "PAID") {
        throw fail(409, "PAYMENT_NOT_CAPTURED", "The Razorpay payment has not been captured.");
      }
      if (payment.providerPaymentId && payment.providerPaymentId !== capturedPayment.id) {
        throw fail(409, "PAYMENT_ATTEMPT_MISMATCH", "A different Razorpay payment is already linked to this order.");
      }

      const verificationEvidence = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        providerOrderId: providerOrder.id,
        providerPaymentId: capturedPayment.id,
        providerOrderStatus: providerOrder.status,
        providerPaymentStatus: capturedPayment.status,
        amountMinor: capturedPayment.amount,
        currency: capturedPayment.currency,
        receipt: providerOrder.receipt,
      };
      const savedPayment = await database.$transaction((transaction) =>
        persistVerifiedPayment(transaction, payment, capturedPayment.id, "PAID", actorId, verificationEvidence),
      );
      return {
        payment: savedPayment,
        order: { id: order.id, orderNumber: order.orderNumber },
        verificationSource: "RAZORPAY_TEST_API",
      };
    },
    handleWebhook: async (rawBody, signature, eventId) => {
      if (!Buffer.isBuffer(rawBody)) {
        throw fail(400, "WEBHOOK_BODY_INVALID", "Razorpay webhook body must be raw JSON.");
      }
      if (!paymentProvider.verifyWebhookSignature(rawBody, signature)) {
        throw fail(401, "WEBHOOK_SIGNATURE_INVALID", "Razorpay webhook signature is invalid.");
      }

      let payload;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw fail(400, "WEBHOOK_BODY_INVALID", "Razorpay webhook body is not valid JSON.");
      }

      const nextStatus = webhookStatuses[payload.event];
      if (!nextStatus) return { received: true, ignored: true };
      if (typeof eventId !== "string" || !eventId.trim() || eventId.length > 255) {
        throw fail(400, "WEBHOOK_EVENT_ID_REQUIRED", "Razorpay webhook event ID is required.");
      }

      const providerPayment = payload.payload?.payment?.entity;
      if (
        !providerPayment ||
        typeof providerPayment.id !== "string" ||
        typeof providerPayment.order_id !== "string"
      ) {
        throw fail(400, "WEBHOOK_PAYMENT_INVALID", "Razorpay webhook payment details are incomplete.");
      }

      const payment = await database.payment.findFirst({
        where: { provider: "RAZORPAY", providerOrderId: providerPayment.order_id },
        select: { id: true, orderId: true, amount: true, providerOrderId: true },
      });
      if (!payment) throw fail(404, "PAYMENT_NOT_FOUND", "Payment not found for this Razorpay order.");
      validateProviderPayment(
        providerPayment,
        payment.providerOrderId,
        providerPayment.id,
        payment.amount,
      );
      if (providerStatus(providerPayment.status) !== nextStatus) {
        throw fail(400, "WEBHOOK_STATUS_MISMATCH", "Razorpay webhook event and payment status do not match.");
      }

      const eventPayload = {
        event: payload.event,
        payment: {
          id: providerPayment.id,
          order_id: providerPayment.order_id,
          amount: providerPayment.amount,
          currency: providerPayment.currency,
          status: providerPayment.status,
        },
      };

      try {
        const savedPayment = await database.$transaction(async (transaction) => {
          await transaction.paymentWebhookEvent.create({
            data: {
              provider: "RAZORPAY",
              eventId,
              eventType: payload.event,
              payload: eventPayload,
              processedAt: new Date(),
            },
          });
          return persistVerifiedPayment(transaction, payment, providerPayment.id, nextStatus);
        });
        return { received: true, duplicate: false, payment: savedPayment };
      } catch (error) {
        if (error.code === "P2002") {
          const existingEvent = await database.paymentWebhookEvent.findUnique({
            where: { eventId },
            select: { id: true },
          });
          if (existingEvent) return { received: true, duplicate: true };
        }
        throw error;
      }
    },
  };
}

export const customerRazorpayService = createCustomerRazorpayService();
