import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";

// Ordered, guarded fulfilment progression; existing legacy statuses are preserved.
const nextStatus = {
  PLACED: "CONFIRMED",
  CONFIRMED: "PAYMENT_PROCESSING",
  PAYMENT_PROCESSING: "INVENTORY_ALLOCATED",
  INVENTORY_ALLOCATED: "PICKING",
  PICKING: "PACKED",
  PACKED: "SHIPPED",
  SHIPPED: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};
const progression = [
  "PLACED",
  "CONFIRMED",
  "PAYMENT_PROCESSING",
  "INVENTORY_ALLOCATED",
  "PICKING",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];
const fail = (status, code, message) =>
  Object.assign(new Error(message), { status, code });

export function createOwnerOrdersService(
  database = prisma,
  lookupShop = getOwnerShop,
) {
  return {
    list: async (ownerId) => {
      const shop = await lookupShop(ownerId);
      return database.shopOrder.findMany({
        where: { shopId: shop.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          order: {
            select: {
              orderNumber: true,
              shippingSnapshot: true,
              createdAt: true,
              customer: { select: { name: true } },
              address: {
                select: {
                  recipient: true,
                  mobile: true,
                  line1: true,
                  line2: true,
                  city: true,
                  region: true,
                  postalCode: true,
                  country: true,
                },
              },
              payments: {
                select: { provider: true, status: true, amount: true },
              },
            },
          },
          items: true,
          statusHistory: { orderBy: { createdAt: "asc" } },
        },
      });
    },
    updateStatus: async (ownerId, orderId, actorId, status) => {
      if (
        [
          "SHIPPED",
          "OUT_FOR_DELIVERY",
          "DELIVERED",
          "DELIVERY_FAILED",
          "RETURNED",
        ].includes(status)
      ) {
        throw fail(
          403,
          "DELIVERY_WORKFLOW_REQUIRED",
          "This status must be updated through Delivery or Returns Management.",
        );
      }
      if (["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status)) {
        throw fail(
          403,
          "ASSOCIATE_DELIVERY_ONLY",
          "Delivery statuses can only be updated through an assigned Delivery Associate.",
        );
      }
      const shop = await lookupShop(ownerId);
      const order = await database.shopOrder.findFirst({
        where: { id: orderId, shopId: shop.id },
        select: {
          id: true,
          orderId: true,
          status: true,
          order: {
            select: { payments: { select: { provider: true, status: true } } },
          },
        },
      });
      if (!order)
        throw fail(404, "ORDER_NOT_FOUND", "Order not found in your shop.");

      const hasUnverifiedRazorpayPayment =
        order.order?.payments?.some(
          (payment) =>
            payment.provider === "RAZORPAY" && payment.status !== "PAID",
        ) ?? false;

      const inventoryAllocationIndex = progression.indexOf(
        "INVENTORY_ALLOCATED",
      );

      const requestedStageIndex = progression.indexOf(status);

      const requiresVerifiedPayment =
        requestedStageIndex >= inventoryAllocationIndex;
      console.log("[ORDER STATUS DEBUG]", {
        orderId,
        currentStatus: order.status,
        requestedStatus: status,
        payments: order.order?.payments,
        hasUnverifiedRazorpayPayment,
        requiresVerifiedPayment,
      });

      if (hasUnverifiedRazorpayPayment && requiresVerifiedPayment) {
        throw fail(
          409,
          "PAYMENT_NOT_VERIFIED",
          "Razorpay payment must be verified before inventory allocation and fulfilment.",
        );
      }

      // Assignment and delivery transitions belong to Delivery Management.
      const assigned = await database.deliveryAssignment.findUnique({
        where: { shopOrderId: order.id },
        select: { id: true },
      });
      if (assigned)
        throw fail(
          409,
          "DELIVERY_ALREADY_ASSIGNED",
          "This order is assigned for delivery. Manage its assignment in Delivery Management.",
        );

      const currentIndex = progression.indexOf(order.status);
      const targetIndex = progression.indexOf(status);

      // No preparation updates to delivery stages; those have their own APIs.
      if (
        targetIndex > progression.indexOf("PACKED") ||
        currentIndex > progression.indexOf("PACKED")
      ) {
        throw fail(
          403,
          "DELIVERY_WORKFLOW_REQUIRED",
          "Use Delivery Management or Returns for delivery/return changes.",
        );
      }

      // Allow direct updates within Shop Owner preparation stages only.
      // Delivery and return statuses remain protected by the checks above.

      const lastPreparationIndex = progression.indexOf("PACKED");

      const currentIsPreparationStage =
        currentIndex >= 0 && currentIndex <= lastPreparationIndex;

      const targetIsPreparationStage =
        targetIndex >= 0 && targetIndex <= lastPreparationIndex;

      if (!currentIsPreparationStage || !targetIsPreparationStage) {
        throw fail(
          403,
          "DELIVERY_WORKFLOW_REQUIRED",
          "Use Delivery Management or Returns Management for this status.",
        );
      }

      if (currentIndex === targetIndex) {
        throw fail(
          409,
          "ORDER_STATUS_UNCHANGED",
          "The order is already in the selected status.",
        );
      }

      await database.$transaction(async (tx) => {
        const changed = await tx.shopOrder.updateMany({
          where: { id: order.id, shopId: shop.id, status: order.status },
          data: { status },
        });
        if (changed.count !== 1)
          throw fail(
            409,
            "ORDER_CHANGED",
            "The order status changed. Refresh and try again.",
          );
        await tx.orderStatusHistory.create({
          data: { shopOrderId: order.id, status },
        });
        const siblings = await tx.shopOrder.findMany({
          where: { orderId: order.orderId },
          select: { status: true },
        });
        const progress = siblings.map(({ status: current }) =>
          progression.indexOf(current),
        );
        if (progress.every((step) => step >= 0))
          await tx.order.update({
            where: { id: order.orderId },
            data: { status: progression[Math.min(...progress)] },
          });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "SHOP_ORDER_STATUS_CHANGED",
            targetType: "SHOP_ORDER",
            targetId: order.id,
            metadata: { from: order.status, to: status },
          },
        });
      });
      return { id: order.id, status };
    },
  };
}

export const ownerOrdersService = createOwnerOrdersService();
