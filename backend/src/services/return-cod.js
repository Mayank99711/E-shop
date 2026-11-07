import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";
const fail = (status, code, message) =>
  Object.assign(new Error(message), { status, code });
const includes = {
  shopOrder: {
    select: {
      status: true,
      order: {
        select: {
          orderNumber: true,
          customerId: true,
          customer: { select: { name: true } },
          address: {
            select: {
              mobile: true,
              line1: true,
              line2: true,
              city: true,
              region: true,
              postalCode: true,
            },
          },
        },
      },
      items: { select: { productName: true, quantity: true } },
    },
  },
  employee: { select: { name: true } },
};
function serialize(r) {
  return {
    id: r.id,
    shopOrderId: r.shopOrderId,
    orderNumber: r.shopOrder.order.orderNumber,
    customerName: r.shopOrder.order.customer.name,
    address: [
      r.shopOrder.order.address?.line1,
      r.shopOrder.order.address?.line2,
      r.shopOrder.order.address?.city,
      r.shopOrder.order.address?.region,
      r.shopOrder.order.address?.postalCode,
    ]
      .filter(Boolean)
      .join(", "),
    phone: r.shopOrder.order.address?.mobile || "",
    items: r.shopOrder.items,
    status: r.status,
    reason: r.reason,
    decisionNote: r.decisionNote,
    failureReason: r.failureReason,
    employeeId: r.employeeId,
    employeeName: r.employee?.name || "",
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
export async function customerReturns(customerId) {
  const rows = await prisma.shopReturn.findMany({
    where: { shopOrder: { order: { customerId } } },
    include: includes,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(serialize);
}
export async function requestReturn(customerId, shopOrderId, reason) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.shopOrder.findFirst({
      where: { id: shopOrderId, order: { customerId } },
      select: { id: true, status: true },
    });
    if (!order)
      throw fail(
        404,
        "ORDER_NOT_FOUND",
        "This order does not belong to your account.",
      );
    if (order.status !== "DELIVERED")
      throw fail(
        409,
        "NOT_DELIVERED",
        "Returns are allowed only for delivered shop orders.",
      );
    if (await tx.shopReturn.findUnique({ where: { shopOrderId } }))
      throw fail(
        409,
        "RETURN_EXISTS",
        "A return request already exists for this shop order.",
      );
    return tx.shopReturn.create({
      data: { shopOrderId, reason: reason.trim(), status: "REQUESTED" },
    });
  });
}
export async function ownerReturns(ownerId) {
  const shop = await getOwnerShop(ownerId);
  const [rows, employees] = await Promise.all([
    prisma.shopReturn.findMany({
      where: { shopOrder: { shopId: shop.id } },
      include: includes,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.employee.findMany({
      where: {
        shopId: shop.id,
        employeeRole: "DELIVERY_ASSOCIATE",
        isActive: true,
        userId: { not: null },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { returns: rows.map(serialize), employees };
}
export async function ownerReturnAction(
  ownerId,
  actorId,
  id,
  action,
  employeeId,
  note,
) {
  const shop = await getOwnerShop(ownerId);
  return prisma.$transaction(async (tx) => {
    const row = await tx.shopReturn.findFirst({
      where: { id, shopOrder: { shopId: shop.id } },
      select: { id: true, status: true, employeeId: true },
    });
    if (!row) throw fail(404, "RETURN_NOT_FOUND", "Return request not found.");
    const next = {
      REQUESTED: { approve: "APPROVED", reject: "REJECTED" },
      APPROVED: { assign: "ASSIGNED", close: "CLOSED" },
      ASSIGNED: { assign: "ASSIGNED" },
      PICKUP_FAILED: { assign: "ASSIGNED" },
      HANDED_OVER: { receive: "RECEIVED" },
      RECEIVED: { close: "CLOSED" },
    }[row.status]?.[action];
    if (!next)
      throw fail(
        409,
        "INVALID_RETURN_ACTION",
        "Action not allowed for current return status.",
      );
    if (action === "assign") {
      const employee = await tx.employee.findFirst({
        where: {
          id: employeeId,
          shopId: shop.id,
          isActive: true,
          employeeRole: "DELIVERY_ASSOCIATE",
          userId: { not: null },
        },
        select: { id: true },
      });
      if (!employee)
        throw fail(
          400,
          "INVALID_ASSOCIATE",
          "Select an active Delivery Associate with login access.",
        );
    }
    if (action === "reject" && (!note || note.trim().length < 3))
      throw fail(400, "REASON_REQUIRED", "Provide a rejection reason.");
    const changed = await tx.shopReturn.updateMany({
      where: { id, status: row.status },
      data: {
        status: next,
        ...(action === "assign" ? { employeeId } : {}),
        ...(action === "reject" || action === "close"
          ? { decisionNote: note?.trim() || null }
          : {}),
        ...(action === "assign" ? { failureReason: null } : {}),
      },
    });
    if (changed.count !== 1)
      throw fail(409, "STATE_CHANGED", "Return changed. Refresh and retry.");
    await tx.auditLog.create({
      data: {
        actorId,
        action: `RETURN_${next}`,
        targetType: "SHOP_ORDER",
        targetId: row.id,
        metadata: {
          employeeId: action === "assign" ? employeeId : row.employeeId,
          note: note || null,
        },
      },
    });
    return { id, status: next };
  });
}
export async function associateReturns(user) {
  const e = user.employeeProfile;
  const rows = await prisma.shopReturn.findMany({
    where: { employeeId: e.id, shopOrder: { shopId: e.shop.id } },
    include: includes,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(serialize);
}
export async function associateReturnAction(user, id, action, reason) {
  const e = user.employeeProfile;
  return prisma.$transaction(async (tx) => {
    const row = await tx.shopReturn.findFirst({
      where: { id, employeeId: e.id, shopOrder: { shopId: e.shop.id } },
      select: { id: true, status: true, shopOrderId: true },
    });
    if (!row)
      throw fail(404, "NOT_ASSIGNED", "This pickup is not assigned to you.");
    const next = {
      ASSIGNED: { collect: "COLLECTED", failed: "PICKUP_FAILED" },
      COLLECTED: { handover: "HANDED_OVER" },
    }[row.status]?.[action];
    if (!next) throw fail(409, "INVALID_RETURN_ACTION", "Action not allowed.");
    if (action === "failed" && (!reason || reason.trim().length < 3))
      throw fail(400, "REASON_REQUIRED", "Provide pickup failure reason.");
    const changed = await tx.shopReturn.updateMany({
      where: { id, status: row.status, employeeId: e.id },
      data: {
        status: next,
        failureReason: action === "failed" ? reason.trim() : null,
      },
    });
    if (changed.count !== 1)
      throw fail(409, "STATE_CHANGED", "Pickup changed. Refresh.");
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: `RETURN_${next}`,
        targetType: "SHOP_ORDER",
        targetId: row.shopOrderId,
        metadata: {
          returnId: row.id,
          reason: action === "failed" ? reason : null,
        },
      },
    });
    return { id, status: next };
  });
}
export async function ownerCodCollections(ownerId) {
  const shop = await getOwnerShop(ownerId);
  const rows = await prisma.deliveryCodCollection.findMany({
    where: { shopId: shop.id },
    include: {
      assignment: {
        include: {
          shopOrder: { select: { order: { select: { orderNumber: true } } } },
          employee: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    assignmentId: r.assignmentId,
    orderNumber: r.assignment.shopOrder.order.orderNumber,
    associate: r.assignment.employee.name,
    amount: r.amount.toString(),
    status: r.status,
    collectedAt: r.collectedAt,
    verifiedAt: r.verifiedAt,
  }));
}
export async function confirmCodHandover(ownerId, actorId, collectionId) {
  const shop = await getOwnerShop(ownerId);
  return prisma.$transaction(async (tx) => {
    const c = await tx.deliveryCodCollection.findFirst({
      where: { id: collectionId, shopId: shop.id },
      include: {
        assignment: {
          select: { status: true, shopOrder: { select: { orderId: true } } },
        },
      },
    });
    if (!c) throw fail(404, "COD_NOT_FOUND", "COD collection not found.");
    if (c.status !== "COLLECTED" || c.assignment.status !== "DELIVERED")
      throw fail(
        409,
        "COD_NOT_READY",
        "Only collected cash for delivered orders can be verified.",
      );
    const p = await tx.payment.findUnique({ where: { id: c.paymentId } });
    if (
      !p ||
      p.orderId !== c.assignment.shopOrder.orderId ||
      p.provider.toUpperCase() !== "COD" ||
      p.status !== "PENDING" ||
      Number(p.amount) !== Number(c.amount)
    )
      throw fail(409, "COD_MISMATCH", "COD payment amount or state mismatch.");
    const updated = await tx.deliveryCodCollection.updateMany({
      where: { id: c.id, status: "COLLECTED" },
      data: { status: "VERIFIED", verifiedAt: new Date(), verifiedBy: actorId },
    });
    if (updated.count !== 1)
      throw fail(
        409,
        "COD_ALREADY_VERIFIED",
        "COD has already been processed.",
      );
    const paid = await tx.payment.updateMany({
      where: { id: p.id, status: "PENDING" },
      data: { status: "PAID", verifiedAt: new Date() },
    });
    if (paid.count !== 1)
      throw fail(409, "PAYMENT_CHANGED", "Payment status changed.");
    await tx.auditLog.create({
      data: {
        actorId,
        action: "COD_HANDOVER_VERIFIED",
        targetType: "PAYMENT",
        targetId: p.id,
        metadata: { collectionId: c.id, amount: String(c.amount) },
      },
    });
    return { id: c.id, status: "VERIFIED" };
  });
}
