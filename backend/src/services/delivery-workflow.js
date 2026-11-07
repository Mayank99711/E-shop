import { prisma } from '../config/database.js';
import { getOwnerShop } from './owner-shop.js';

const error = (status, code, message) => Object.assign(new Error(message), { status, code });
const view = (d) => ({
  id: d.id, shopOrderId: d.shopOrderId, employeeId: d.employeeId,
  employeeName: d.employee?.name || '', status: d.status, failureReason: d.failureReason,
  assignedAt: d.assignedAt, pickedUpAt: d.pickedUpAt, outForDeliveryAt: d.outForDeliveryAt,
  completedAt: d.completedAt, updatedAt: d.updatedAt,
  orderNumber: d.shopOrder.order.orderNumber,
  orderStatus: d.shopOrder.status,
  customerName: d.shopOrder.order.customer?.name || 'Customer',
  customerPhone: d.shopOrder.order.address?.mobile || null,
  address: d.shopOrder.order.address ? [d.shopOrder.order.address.line1, d.shopOrder.order.address.line2, d.shopOrder.order.address.city, d.shopOrder.order.address.region, d.shopOrder.order.address.postalCode].filter(Boolean).join(', ') : '',
  itemCount: d.shopOrder.items.reduce((sum, i) => sum + i.quantity, 0),
  paymentMethod: d.shopOrder.order.payments?.some(p => p.provider?.toUpperCase() === "COD") ? "COD" : "PREPAID",
  codAmount: d.shopOrder.order.payments?.find(p => p.provider?.toUpperCase() === "COD")?.amount?.toString() || null,
  codPaymentStatus: d.shopOrder.order.payments?.find(p => p.provider?.toUpperCase() === "COD")?.status || null,
});
const include = {
  employee: { select: { name: true } },
  shopOrder: { select: { status: true, items: { select: { quantity: true } }, order: { select: { orderNumber: true, payments: { select: { provider: true, amount: true, status: true } }, customer: { select: { name: true } }, address: { select: { mobile: true, line1: true, line2: true, city: true, region: true, postalCode: true } } } } } },
};
export async function ownerDeliveryData(ownerId) {
  const shop = await getOwnerShop(ownerId);
  const [deliveries, employees, orders] = await Promise.all([
    prisma.deliveryAssignment.findMany({ where: { shopId: shop.id }, include, orderBy: { assignedAt: 'desc' }, take: 200 }),
    prisma.employee.findMany({ where: { shopId: shop.id, employeeRole: 'DELIVERY_ASSOCIATE', isActive: true }, select: { id: true, name: true, employeeCode: true, userId: true }, orderBy: { name: 'asc' } }),
    prisma.shopOrder.findMany({ where: { shopId: shop.id, status: { in: ['PACKED', 'SHIPPED'] }, deliveryAssignment: null }, select: { id: true, status: true, order: { select: { orderNumber: true, customer: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  return { deliveries: deliveries.map(view), employees, availableOrders: orders.map(o => ({ id: o.id, number: o.order.orderNumber, customer: o.order.customer?.name || 'Customer', status: o.status })) };
}
export async function assignDelivery(ownerId, actorId, shopOrderId, employeeId) {
  const shop = await getOwnerShop(ownerId);
  return prisma.$transaction(async tx => {
    const [order, employee, old] = await Promise.all([
      tx.shopOrder.findFirst({ where: { id: shopOrderId, shopId: shop.id }, select: { id: true, status: true } }),
      tx.employee.findFirst({ where: { id: employeeId, shopId: shop.id, isActive: true, employeeRole: 'DELIVERY_ASSOCIATE', userId: { not: null } }, select: { id: true } }),
      tx.deliveryAssignment.findUnique({ where: { shopOrderId } }),
    ]);
    if (!order) throw error(404, 'ORDER_NOT_FOUND', 'Order not found in your shop.');
    if (!employee) throw error(400, 'INVALID_ASSOCIATE', 'Choose an active Delivery Associate with login access.');
    if (!['PACKED', 'SHIPPED'].includes(order.status) && !(old?.status === 'FAILED' && order.status === 'OUT_FOR_DELIVERY')) throw error(409, 'ORDER_NOT_READY', 'Order must be packed or shipped before assignment.');
    if (old && !['ASSIGNED', 'FAILED'].includes(old.status)) throw error(409, 'DELIVERY_IN_PROGRESS', 'Only assigned or failed deliveries may be reassigned.');
    const record = old
      ? await tx.deliveryAssignment.update({ where: { id: old.id }, data: { employeeId, status: 'ASSIGNED', failureReason: null, pickedUpAt: null, outForDeliveryAt: null, completedAt: null } })
      : await tx.deliveryAssignment.create({ data: { shopOrderId, shopId: shop.id, employeeId, status: 'ASSIGNED' } });
    if (old?.status === 'FAILED' && order.status === 'OUT_FOR_DELIVERY') {
      await tx.shopOrder.update({ where: { id: order.id }, data: { status: 'SHIPPED' } });
      await tx.orderStatusHistory.create({ data: { shopOrderId: order.id, status: 'SHIPPED', note: 'Reattempt approved by shop owner' } });
      const orderDetails = await tx.shopOrder.findUnique({ where: { id: order.id }, select: { orderId: true } });
      const siblings = await tx.shopOrder.findMany({ where: { orderId: orderDetails.orderId }, select: { status: true } });
      const p = ['PLACED','CONFIRMED','PAYMENT_PROCESSING','INVENTORY_ALLOCATED','PICKING','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED'];
      const indices = siblings.map(x => p.indexOf(x.status));
      if (indices.every(i => i >= 0)) await tx.order.update({ where: { id: orderDetails.orderId }, data: { status: p[Math.min(...indices)] } });
    }
    await tx.auditLog.create({ data: { actorId, action: old ? 'DELIVERY_REASSIGNED' : 'DELIVERY_ASSIGNED', targetType: 'SHOP_ORDER', targetId: shopOrderId, metadata: { employeeId, previousEmployeeId: old?.employeeId || null } } });
    return record;
  });
}
export async function employeeDeliveries(user) {
  const employee = user.employeeProfile;
  const rows = await prisma.deliveryAssignment.findMany({ where: { shopId: employee.shop.id, employeeId: employee.id }, include, orderBy: { assignedAt: 'desc' }, take: 200 });
  return rows.map(view);
}
export async function progressDelivery(user, assignmentId, action, failureReason, cashConfirmed = false) {
  const employee = user.employeeProfile;
  const next = { ASSIGNED: { pickup: 'PICKED_UP' }, PICKED_UP: { start: 'OUT_FOR_DELIVERY' }, OUT_FOR_DELIVERY: { delivered: 'DELIVERED', failed: 'FAILED' } };
  return prisma.$transaction(async tx => {
    const row = await tx.deliveryAssignment.findFirst({ where: { id: assignmentId, shopId: employee.shop.id, employeeId: employee.id }, include: { shopOrder: { select: { id: true, orderId: true, status: true } } } });
    if (!row) throw error(404, 'NOT_ASSIGNED', 'Delivery is not assigned to you.');
    const nextStatus = next[row.status]?.[action];
    if (!nextStatus) throw error(409, 'INVALID_TRANSITION', 'This action is not allowed at the current delivery stage.');
    if (action === 'failed' && (!failureReason || failureReason.trim().length < 3 || failureReason.length > 250)) throw error(400, 'FAILURE_REASON_REQUIRED', 'Select or enter a failure reason.');
    if (action === 'pickup' && !['PACKED', 'SHIPPED'].includes(row.shopOrder.status)) throw error(409, 'ORDER_STATUS_CONFLICT', 'Order is not packed or shipped.');
    if (action === 'start' && row.shopOrder.status !== 'SHIPPED') throw error(409, 'ORDER_STATUS_CONFLICT', 'Owner order is not ready for delivery.');
    if (action === 'delivered' && row.shopOrder.status !== 'OUT_FOR_DELIVERY') throw error(409, 'ORDER_STATUS_CONFLICT', 'Order is not marked out for delivery.');
    // Never infer COD payment success from an order being delivered.
    if (action === 'delivered') {
      const shopCount = await tx.shopOrder.count({ where: { orderId: row.shopOrder.orderId } });
      const cod = await tx.payment.findFirst({ where: { orderId: row.shopOrder.orderId, provider: { equals: 'COD', mode: 'insensitive' } } });
      if (cod) {
        if (shopCount !== 1) throw error(409, 'MULTI_SHOP_COD_NOT_SUPPORTED', 'COD collection needs a single-shop order.');
        if (cod.status !== 'PENDING') throw error(409, 'COD_PAYMENT_NOT_PENDING', 'This COD payment is not awaiting cash collection.');
        if (!cashConfirmed) throw error(400, 'COD_CASH_CONFIRMATION_REQUIRED', 'Confirm that the exact COD cash amount was collected before marking delivered.');
        if (await tx.deliveryCodCollection.findUnique({ where: { assignmentId: row.id } })) throw error(409, 'COD_ALREADY_COLLECTED', 'Cash was already recorded for this delivery.');
        await tx.deliveryCodCollection.create({ data: { assignmentId: row.id, shopId: employee.shop.id, paymentId: cod.id, amount: cod.amount } });
      }
    }
    const updated = await tx.deliveryAssignment.updateMany({ where: { id: row.id, status: row.status, employeeId: employee.id }, data: { status: nextStatus, ...(action === 'pickup' ? { pickedUpAt: new Date() } : {}), ...(action === 'start' ? { outForDeliveryAt: new Date() } : {}), ...(action === 'delivered' || action === 'failed' ? { completedAt: new Date() } : {}), failureReason: action === 'failed' ? failureReason.trim() : null } });
    if (updated.count !== 1) throw error(409, 'STALE_DELIVERY', 'Delivery changed. Refresh and retry.');
    if (action === 'pickup' || action === 'start' || action === 'delivered') {
      const orderStatus = action === 'pickup' ? 'SHIPPED' : action === 'start' ? 'OUT_FOR_DELIVERY' : 'DELIVERED';
      if (row.shopOrder.status !== orderStatus) {
        const changed = await tx.shopOrder.updateMany({ where: { id: row.shopOrderId, shopId: employee.shop.id, status: row.shopOrder.status }, data: { status: orderStatus } });
        if (changed.count !== 1) throw error(409, 'ORDER_CHANGED', 'Order changed. Refresh and retry.');
        await tx.orderStatusHistory.create({ data: { shopOrderId: row.shopOrderId, status: orderStatus, note: `Delivery associate: ${action}` } });
      }
      const siblings = await tx.shopOrder.findMany({ where: { orderId: row.shopOrder.orderId }, select: { status: true } });
      const progression = ['PLACED','CONFIRMED','PAYMENT_PROCESSING','INVENTORY_ALLOCATED','PICKING','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED'];
      const indices = siblings.map(s => progression.indexOf(s.status));
      if (indices.every(index => index >= 0)) await tx.order.update({ where: { id: row.shopOrder.orderId }, data: { status: progression[Math.min(...indices)] } });
    }
    await tx.auditLog.create({ data: { actorId: user.id, action: `DELIVERY_${nextStatus}`, targetType: 'SHOP_ORDER', targetId: row.shopOrderId, metadata: { employeeId: employee.id, ...(failureReason && action === 'failed' ? { failureReason: failureReason.trim() } : {}) } } });
    return { id: row.id, status: nextStatus };
  });
}
