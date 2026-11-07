import { prisma } from "../config/database.js";

const orderFields = {
  id: true,
  orderNumber: true,
  status: true,
  subtotal: true,
  taxTotal: true,
  deliveryTotal: true,
  grandTotal: true,
  createdAt: true,
  payments: { select: { provider: true, status: true, amount: true } },
  shopOrders: {
    select: {
      id: true,
      status: true,
      shop: { select: { name: true } },
      items: {
        select: {
          id: true,
          productId: true,
          productName: true,
          shopName: true,
          sku: true,
          unitPrice: true,
          quantity: true,
        },
      },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        select: { status: true, note: true, createdAt: true },
      },
    },
  },
};

export function createCustomerOrdersService(database = prisma) {
  return {
    list: (customerId) =>
      database.order.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: orderFields,
      }),
    get: (customerId, orderId) =>
      database.order.findFirst({
        where: { id: orderId, customerId },
        select: { ...orderFields, shippingSnapshot: true },
      }),
  };
}

export const customerOrdersService = createCustomerOrdersService();
