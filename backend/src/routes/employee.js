import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { requireEmployeePermission } from "../middleware/require-employee-permission.js";
import { getRolePermissions } from "../config/employee-permissions.js";
import { prisma } from "../config/database.js";
import { createOwnerOrdersService } from "../services/owner-orders.js";
import { createOwnerProductService } from "../services/owner-products.js";
import { randomUUID } from "node:crypto";

const httpFailure = (status, code, message) => Object.assign(new Error(message), { status, code });
const router = Router();

// Every employee route requires a valid session.
router.use(requireAuth);

// Get logged-in employee profile and permissions.
router.get("/me", (req, res) => {
  if (req.authUser?.role !== "SHOP_EMPLOYEE") {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Employee access required." } });
  }
  const user = req.authUser;
  const employee = user.employeeProfile;

  return res.status(200).json({
    success: true,
    data: {
      userId: user.id,
      employeeId: employee.id,
      name: user.name,
      email: user.email,
      role: "SHOP_EMPLOYEE",
      employeeRole: employee.employeeRole,
      shopId: employee.shop.id,
      permissions: Array.isArray(employee.permissionOverrides)
        ? employee.permissionOverrides
        : getRolePermissions(employee.employeeRole),
    },
  });
});
// GET /api/employee/orders
// Only employees with orders.view permission can access this endpoint.
router.get(
  "/orders",
  requireEmployeePermission("orders.view"),
  async (req, res, next) => {
    try {
      const employee = req.authUser.employeeProfile;
      const shopId = employee.shop.id;

      const orders = await prisma.shopOrder.findMany({
        where: {
          shopId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
        select: {
          id: true,
          status: true,
          createdAt: true,
          order: {
            select: {
              orderNumber: true,
              customer: {
                select: {
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      });

      return res.status(200).json({
        success: true,
        items: orders.map((item) => ({
          id: item.id,
          orderNumber: item.order?.orderNumber || item.id,
          customerName: item.order?.customer?.name || "Customer",
          status: item.status,
          createdAt: item.createdAt,
          itemCount: item._count.items,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);
// Read-only products: no change to Shop Owner's product APIs.
router.get("/products", requireEmployeePermission("products.view"), async (req, res, next) => {
  try {
    const shopId = req.authUser.employeeProfile.shop.id;
    const products = await prisma.product.findMany({
      where: { shopId }, orderBy: { updatedAt: "desc" }, take: 100,
      select: {
        id: true, name: true, status: true, updatedAt: true,
        category: { select: { name: true } },
        brand: { select: { name: true } },
        _count: { select: { variants: true } },
      },
    });
    return res.json({ success: true, items: products.map((p) => ({
      id: p.id, name: p.name, category: p.category?.name || null,
      brand: p.brand?.name || null, status: p.status,
      variantCount: p._count.variants, updatedAt: p.updatedAt,
    })) });
  } catch (error) { next(error); }
});

// Read-only inventory; variants and related product both belong to this shop.
router.get("/inventory", requireEmployeePermission("inventory.view"), async (req, res, next) => {
  try {
    const shopId = req.authUser.employeeProfile.shop.id;
    const variants = await prisma.productVariant.findMany({
      where: { shopId, product: { shopId } }, orderBy: { updatedAt: "desc" }, take: 100,
      select: {
        id: true, sku: true, variantName: true, stock: true,
        price: true, isActive: true, updatedAt: true,
        product: { select: { name: true } },
      },
    });
    return res.json({ success: true, items: variants.map((v) => ({
      id: v.id, sku: v.sku, name: v.product.name,
      variantName: v.variantName, stock: v.stock,
      price: String(v.price), isActive: v.isActive, updatedAt: v.updatedAt,
    })) });
  } catch (error) { next(error); }
});

// Customers associated with orders belonging to the employee's own shop.
router.get("/customers", requireEmployeePermission("customers.view"), async (req, res, next) => {
  try {
    const shopId = req.authUser.employeeProfile.shop.id;
    const shopOrders = await prisma.shopOrder.findMany({
      where: { shopId }, orderBy: { createdAt: "desc" }, take: 100,
      select: {
        createdAt: true,
        order: { select: { customerId: true, customer: { select: { name: true } } } },
      },
    });
    const customersById = new Map();
    for (const item of shopOrders) {
      const id = item.order.customerId;
      if (!customersById.has(id)) {
        customersById.set(id, { id, name: item.order.customer.name, orderCount: 0, lastOrderAt: item.createdAt });
      }
      customersById.get(id).orderCount += 1;
    }
    return res.json({ success: true, items: [...customersById.values()], scope: "latest-100-shop-orders" });
  } catch (error) { next(error); }
});

// Read-only delivery status from shop-owned orders; no address or payment data exposed.
router.get("/delivery", requireEmployeePermission("delivery.view"), async (req, res, next) => {
  try {
    const shopId = req.authUser.employeeProfile.shop.id;
    const shopOrders = await prisma.shopOrder.findMany({
      where: { shopId }, orderBy: { createdAt: "desc" }, take: 100,
      select: {
        id: true, status: true, createdAt: true, updatedAt: true,
        order: { select: { orderNumber: true } },
      },
    });
    return res.json({ success: true, items: shopOrders.map(item => ({
      id: item.id, orderNumber: item.order.orderNumber,
      status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt,
    })) });
  } catch (error) { next(error); }
});

// Employee order transitions reuse the existing owner's validated, audited service.
router.patch("/orders/:orderId/status", requireEmployeePermission("orders.manage"), async (req, res, next) => {
  try {
    const shopId = req.authUser.employeeProfile.shop.id;
    const orderId = req.params.orderId;
    const status = req.body?.status;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return res.status(400).json({ error: { code: "INVALID_ORDER_ID", message: "Invalid order ID." } });
    }
    const allowed = ["PLACED", "CONFIRMED", "PAYMENT_PROCESSING", "INVENTORY_ALLOCATED", "PICKING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: { code: "INVALID_ORDER_STATUS", message: "Invalid order status." } });
    }
    // Never accept shopId from the request. The lookup is bound to the authenticated employee.
    const ordersService = createOwnerOrdersService(prisma, async () => ({ id: shopId }));
    const result = await ordersService.updateStatus(req.authUser.id, orderId, req.authUser.id, status);
    return res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

// Employee product status management: preserve existing owner's service guards and audit logging.
router.patch("/products/:productId/status", requireEmployeePermission("products.manage"), async (req, res, next) => {
  try {
    const productId = req.params.productId;
    const status = req.body?.status;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId) || !["DRAFT", "ACTIVE", "ARCHIVED"].includes(status)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid product or status." } });
    }
    const shopId = req.authUser.employeeProfile.shop.id;
    const service = createOwnerProductService(prisma, async () => ({ id: shopId }));
    const updated = await service.setStatus(req.authUser.id, req.authUser.id, productId, status);
    return res.json({ success: true, data: { id: updated.id, status: updated.status } });
  } catch (error) { next(error); }
});

// Atomic stock adjustment with an inventory movement and audit record.
router.post("/inventory/:variantId/adjust", requireEmployeePermission("inventory.manage"), async (req, res, next) => {
  try {
    const variantId = req.params.variantId;
    const quantity = req.body?.quantity;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(variantId) || !Number.isSafeInteger(quantity) || quantity === 0 || Math.abs(quantity) > 100000) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Specify a nonzero integer adjustment within 100000 units." } });
    }
    const shopId = req.authUser.employeeProfile.shop.id;
    const actorId = req.authUser.id;
    const result = await prisma.$transaction(async (tx) => {
      // Row lock prevents overlapping adjustments from losing updates.
      const rows = await tx.$queryRaw`SELECT "id", "stock" FROM "ProductVariant" WHERE "id" = ${variantId}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE`;
      if (!rows.length) throw httpFailure(404, "VARIANT_NOT_FOUND", "Variant is not in your shop.");
      const existingStock = rows[0].stock;
      const nextStock = existingStock + quantity;
      if (!Number.isSafeInteger(nextStock) || nextStock < 0) throw httpFailure(409, "INSUFFICIENT_STOCK", "Adjustment would make stock negative.");
      const reserved = await tx.inventoryReservation.aggregate({
        where: { shopId, productVariantId: variantId, status: "ACTIVE", expiresAt: { gt: new Date() } },
        _sum: { quantity: true },
      });
      if (nextStock < (reserved._sum.quantity || 0)) throw httpFailure(409, "RESERVED_STOCK", "Cannot reduce stock below active reservations.");
      const variant = await tx.productVariant.update({ where: { id: variantId }, data: { stock: nextStock }, select: { id: true, stock: true } });
      await tx.inventoryMovement.create({ data: {
        shopId, productVariantId: variantId, quantity, reason: "MANUAL_ADJUSTMENT",
        referenceType: "EMPLOYEE_STOCK_ADJUSTMENT", referenceId: randomUUID(), actorId,
      } });
      await tx.auditLog.create({ data: {
        actorId, action: "INVENTORY_STOCK_CHANGED", targetType: "PRODUCT_VARIANT", targetId: variantId,
        metadata: { previousStock: existingStock, adjustment: quantity, stock: nextStock, source: "employee" },
      } });
      return variant;
    });
    return res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

// Read-only payment visibility scoped to shop orders, with no processor identifiers.
router.get("/payments", requireEmployeePermission("payments.view"), async (req, res, next) => {
  try {
    const shopId = req.authUser.employeeProfile.shop.id;
    const payments = await prisma.payment.findMany({
      where: { order: { shopOrders: { some: { shopId } } } },
      orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, provider: true, status: true, amount: true, createdAt: true, order: { select: { orderNumber: true, shopOrders: { where: { shopId }, select: { subtotal: true } } } } },
    });
    // Payments may cover multiple shops; do not attribute the entire amount to one shop.
    return res.json({ success: true, items: payments.map(p => ({
      id: p.id, orderNumber: p.order.orderNumber, provider: p.provider,
      status: p.status, createdAt: p.createdAt, amount: null,
    })), note: "Payment amounts are withheld because payments may cover orders from multiple shops." });
  } catch (error) { next(error); }
});

// Shop-specific report counts avoid sharing cross-shop payment totals.
router.get("/reports", requireEmployeePermission("reports.view"), async (req, res, next) => {
  try {
    const shopId = req.authUser.employeeProfile.shop.id;
    const [orders, products, activeProducts, variants, orderStatuses] = await Promise.all([
      prisma.shopOrder.count({ where: { shopId } }),
      prisma.product.count({ where: { shopId } }),
      prisma.product.count({ where: { shopId, status: "ACTIVE" } }),
      prisma.productVariant.aggregate({ where: { shopId }, _sum: { stock: true } }),
      prisma.shopOrder.groupBy({ by: ["status"], where: { shopId }, _count: { _all: true } }),
    ]);
    return res.json({ success: true, data: {
      orders, products, activeProducts, stockUnits: variants._sum.stock || 0,
      orderStatuses: orderStatuses.map(({ status, _count }) => ({ status, count: _count._all })),
    } });
  } catch (error) { next(error); }
});

export default router;
