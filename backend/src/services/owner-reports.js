import { prisma } from "../config/database.js";
import { env } from "../config/env.js";
import { getOwnerShop } from "./owner-shop.js";

export function createOwnerReportsService(database = prisma, lookupShop = getOwnerShop) {
  return {
    listPayments: async (ownerId) => {
      const shop = await lookupShop(ownerId);
      return database.payment.findMany({
        where: { order: { shopOrders: { some: { shopId: shop.id } } } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          provider: true,
          status: true,
          amount: true,
          providerPaymentId: true,
          verifiedAt: true,
          createdAt: true,
          order: { select: { id: true, orderNumber: true } },
        },
      });
    },
    getReports: async (ownerId) => {
      const shop = await lookupShop(ownerId);
      const shopOrderWhere = { shopId: shop.id };
      const paymentWhere = { order: { shopOrders: { some: { shopId: shop.id } } } };
      const [
        orderCount,
        orderStatuses,
        paymentStatuses,
        paidPayments,
        productCount,
        activeProductCount,
        inventoryUnits,
        availableVariants,
        lowStockVariants,
        activeEmployees,
      ] = await Promise.all([
        database.shopOrder.count({ where: shopOrderWhere }),
        database.shopOrder.groupBy({ by: ["status"], where: shopOrderWhere, _count: { _all: true } }),
        database.payment.groupBy({ by: ["status"], where: paymentWhere, _count: { _all: true } }),
        database.payment.aggregate({
          where: { ...paymentWhere, status: "PAID" },
          _sum: { amount: true },
        }),
        database.product.count({ where: { shopId: shop.id } }),
        database.product.count({ where: { shopId: shop.id, status: "ACTIVE" } }),
        database.productVariant.aggregate({
          where: { shopId: shop.id, isActive: true },
          _sum: { stock: true },
        }),
        database.productVariant.count({
          where: { shopId: shop.id, isActive: true, stock: { gt: 0 } },
        }),
        database.productVariant.count({
          where: {
            shopId: shop.id,
            isActive: true,
            stock: { lte: env.LOW_STOCK_THRESHOLD },
          },
        }),
        database.employee.count({ where: { shopId: shop.id, isActive: true } }),
      ]);

      return {
        orderCount,
        orderStatuses: orderStatuses.map(({ status, _count }) => ({ status, count: _count._all })),
        paymentStatuses: paymentStatuses.map(({ status, _count }) => ({ status, count: _count._all })),
        paidPaymentTotal: paidPayments._sum.amount ?? 0,
        products: {
          total: productCount,
          active: activeProductCount,
          inventoryUnits: inventoryUnits._sum.stock ?? 0,
          availableVariants,
          lowStockVariants,
          lowStockThreshold: env.LOW_STOCK_THRESHOLD,
        },
        activeEmployees,
      };
    },
  };
}

export const ownerReportsService = createOwnerReportsService();
