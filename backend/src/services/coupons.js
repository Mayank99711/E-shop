import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export const normalizeCouponCode = (code) => String(code || "").trim().toUpperCase();

export async function quoteCoupon(database, shopId, customerId, code, subtotal) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return { coupon: null, discountTotal: 0 };
  const coupon = await database.shopCoupon.findUnique({ where: { shopId_code: { shopId, code: normalized } } });
  if (!coupon) throw fail(400, "COUPON_INVALID", "Coupon code is invalid for this shop.");
  const now = new Date();
  if (!coupon.isActive || coupon.startsAt > now || coupon.expiresAt <= now) throw fail(400, "COUPON_INACTIVE", "Coupon is inactive or expired.");
  if (round(subtotal) < Number(coupon.minimumOrder)) throw fail(400, "COUPON_MINIMUM_ORDER", `Minimum order value is INR ${coupon.minimumOrder}.`);
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) throw fail(409, "COUPON_LIMIT_REACHED", "Coupon usage limit has been reached.");
  if (coupon.perCustomerLimit !== null) {
    const used = await database.shopCouponRedemption.count({ where: { couponId: coupon.id, customerId } });
    if (used >= coupon.perCustomerLimit) throw fail(409, "COUPON_CUSTOMER_LIMIT", "You have already used this coupon the maximum number of times.");
  }
  let discountTotal = coupon.discountType === "PERCENTAGE"
    ? round(Number(subtotal) * Number(coupon.discountValue) / 100)
    : round(coupon.discountValue);
  if (coupon.maxDiscount !== null) discountTotal = Math.min(discountTotal, Number(coupon.maxDiscount));
  discountTotal = round(Math.max(0, Math.min(subtotal, discountTotal)));
  return { coupon, discountTotal };
}

export async function reserveCoupon(tx, coupon, customerId, orderId) {
  if (!coupon) return;
  // Atomic global quota reservation; rolled back with checkout transaction.
  const now = new Date();
  const updated = await tx.shopCoupon.updateMany({
    where: {
      id: coupon.id, isActive: true, startsAt: { lte: now }, expiresAt: { gt: now },
      ...(coupon.usageLimit !== null ? { usedCount: { lt: coupon.usageLimit } } : {})
    },
    data: { usedCount: { increment: 1 } }
  });
  if (updated.count !== 1) throw fail(409, "COUPON_LIMIT_REACHED", "Coupon is no longer available.");
  if (coupon.perCustomerLimit !== null) {
    const used = await tx.shopCouponRedemption.count({ where: { couponId: coupon.id, customerId } });
    if (used >= coupon.perCustomerLimit) throw fail(409, "COUPON_CUSTOMER_LIMIT", "Coupon limit reached for this customer.");
  }
  await tx.shopCouponRedemption.create({ data: { couponId: coupon.id, customerId, orderId } });
}

export async function listOwnerCoupons(ownerId) {
  const shop = await getOwnerShop(ownerId);
  return prisma.shopCoupon.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: "desc" } });
}
export async function createOwnerCoupon(ownerId, actorId, data) {
  const shop = await getOwnerShop(ownerId);
  if (shop.status !== "ACTIVE") throw fail(409, "SHOP_NOT_ACTIVE", "Shop must be active.");
  const code = normalizeCouponCode(data.code);
  const coupon = await prisma.shopCoupon.create({ data: {
    shopId: shop.id, code, discountType: data.discountType, discountValue: data.discountValue,
    minimumOrder: data.minimumOrder ?? 0, maxDiscount: data.maxDiscount ?? null,
    usageLimit: data.usageLimit ?? null, perCustomerLimit: data.perCustomerLimit ?? 1,
    startsAt: new Date(data.startsAt), expiresAt: new Date(data.expiresAt), isActive: data.isActive ?? true
  } });
  await prisma.auditLog.create({ data: { actorId, action: "SHOP_COUPON_CREATED", targetType: "SHOP_COUPON", targetId: coupon.id, metadata: { shopId: shop.id, code } } });
  return coupon;
}
export async function updateOwnerCoupon(ownerId, actorId, id, data) {
  const shop = await getOwnerShop(ownerId);
  const before = await prisma.shopCoupon.findFirst({ where: { id, shopId: shop.id } });
  if (!before) throw fail(404, "COUPON_NOT_FOUND", "Coupon not found in your shop.");
  const { code: omittedCode, ...safe } = data;
  const coupon = await prisma.shopCoupon.update({ where: { id }, data: {
    ...safe,
    ...(data.startsAt ? { startsAt: new Date(data.startsAt) } : {}),
    ...(data.expiresAt ? { expiresAt: new Date(data.expiresAt) } : {})
  } });
  await prisma.auditLog.create({ data: { actorId, action: "SHOP_COUPON_UPDATED", targetType: "SHOP_COUPON", targetId: id, metadata: { shopId: shop.id, changedFields: Object.keys(safe) } } });
  return coupon;
}
export async function listAdminCoupons() {
  return prisma.shopCoupon.findMany({ include: { shop: { select: { id: true, name: true, code: true } } }, orderBy: { createdAt: "desc" }, take: 500 });
}

// Shop-scoped coupon redemption ledger; the owner never receives other shops' records.
export async function listOwnerCouponUsage(ownerId, couponId) {
  const shop = await getOwnerShop(ownerId);
  const coupon = await prisma.shopCoupon.findFirst({ where: { id: couponId, shopId: shop.id }, select: { id: true } });
  if (!coupon) throw fail(404, "COUPON_NOT_FOUND", "Coupon not found in your shop.");
  const rows = await prisma.shopCouponRedemption.findMany({
    where: { couponId: coupon.id }, orderBy: { createdAt: "desc" }, take: 200,
    select: {
      id: true, createdAt: true,
      coupon: { select: { code: true, discountType: true, discountValue: true } },
      customer: { select: { name: true, email: true } },
      order: { select: { orderNumber: true, status: true, subtotal: true, discountTotal: true, deliveryTotal: true, grandTotal: true } }
    }
  });
  return rows.map(row => ({
    id: row.id, createdAt: row.createdAt,
    customerName: row.customer.name, customerEmail: row.customer.email,
    orderNumber: row.order.orderNumber, orderStatus: row.order.status,
    couponCode: row.coupon.code, couponDiscountType: row.coupon.discountType,
    couponDiscountValue: row.coupon.discountValue,
    orderSubtotal: row.order.subtotal, discountTotal: row.order.discountTotal,
    deliveryTotal: row.order.deliveryTotal, grandTotal: row.order.grandTotal
  }));
}
