import { prisma } from "../config/database.js";

export function createAdminOperationsService(database = prisma) {
  return {
    employees: (take = 100) => database.employee.findMany({
      take,
      orderBy: [{ shop: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        employeeCode: true,
        name: true,
        designation: true,
        isActive: true,
        shop: { select: { id: true, name: true } },
      },
    }),
    commissions: (take = 100) => database.shop.findMany({
      take,
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        commissionPercentage: true,
        owner: { select: { name: true } },
      },
    }),
    orders: (take = 100) => database.order.findMany({
      take,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        grandTotal: true,
        createdAt: true,
        shopOrders: {
          select: {
            status: true,
            shop: { select: { name: true } },
            items: { select: { quantity: true } },
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          select: { provider: true, status: true, amount: true, verifiedAt: true },
        },
      },
    }),
    products: (take = 100) => database.product.findMany({
      take,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        shop: { select: { id: true, name: true } },
        category: { select: { name: true } },
        images: {
          take: 1,
          orderBy: { position: "asc" },
          select: { url: true },
        },
        variants: {
          select: { stock: true, isActive: true },
        },
      },
    }),
    auditLogs: (take = 100) => database.auditLog.findMany({
      take,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
    setProductStatus: async (productId, actorId, status) => {
      const product = await database.product.findUnique({ where: { id: productId }, select: { id: true } });
      if (!product) {
        throw Object.assign(new Error("Product not found."), { status: 404, code: "PRODUCT_NOT_FOUND" });
      }
      return database.$transaction(async (transaction) => {
        const updated = await transaction.product.update({ where: { id: productId }, data: { status } });
        await transaction.auditLog.create({
          data: { actorId, action: "PRODUCT_STATUS_CHANGED", targetType: "PRODUCT", targetId: productId, metadata: { status } },
        });
        return updated;
      });
    },
  };
}

export const adminOperationsService = createAdminOperationsService();
