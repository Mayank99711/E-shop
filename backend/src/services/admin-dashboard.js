import { prisma } from "../config/database.js";

export async function getAdminDashboard(database = prisma) {
  const [shops, owners, customers, employees, activeProducts, pendingRequests, orders, paidPayments, recentShops, recentRequests, recentOrders] = await Promise.all([
    database.shop.count({ where: { status: { not: "ARCHIVED" } } }),
    database.user.count({ where: { role: "SHOP_OWNER" } }),
    database.user.count({ where: { role: "CUSTOMER" } }),
    database.employee.count({ where: { isActive: true } }),
    database.product.count({ where: { status: "ACTIVE" } }),
    database.masterDataRequest.count({ where: { status: "PENDING" } }),
    database.order.count(),
    database.payment.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    database.shop.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { name: true, email: true } } }
    }),
    database.masterDataRequest.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { requester: { select: { name: true } }, shop: { select: { name: true } } }
    }),
    database.order.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, orderNumber: true, status: true, createdAt: true, customer: { select: { name: true } } }
    })
  ]);

  return {
    metrics: {
      shops,
      owners,
      employees,
      customers,
      activeProducts,
      pendingRequests,
      orders,
      paidRevenue: paidPayments._sum.amount || 0
    },
    recent: { shops: recentShops, requests: recentRequests, orders: recentOrders }
  };
}
