import { prisma } from "../config/database.js";
import { quoteCoupon } from "./coupons.js";

const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// Only actual coupons for the cart's shop; never accept an untrusted shopId/subtotal from the browser.
export async function listAvailableCartCoupons(customerId, database = prisma) {
  const cart = await database.cart.findUnique({ where: { customerId }, select: { id: true } });
  if (!cart) return { items: [], shopName: null, subtotal: 0 };
  const lines = await database.cartItem.findMany({
    where: { cartId: cart.id },
    select: {
      quantity: true,
      product: { select: { shopId: true, shop: { select: { name: true, status: true } } } },
      variant: { select: { price: true, discountPrice: true } },
    },
  });
  if (!lines.length) return { items: [], shopName: null, subtotal: 0 };
  const shopIds = [...new Set(lines.map(line => line.product.shopId))];
  if (shopIds.length !== 1) return {
    items: [], shopName: null, subtotal: 0,
    notice: "Coupons are shown for one shop at a time. Checkout supports one shop per order.",
  };
  if (lines[0].product.shop.status !== "ACTIVE") return { items: [], shopName: null, subtotal: 0 };
  const shopId = shopIds[0];
  const subtotal = money(lines.reduce((sum, line) => sum + Number(line.variant.discountPrice ?? line.variant.price) * line.quantity, 0));
  const now = new Date();
  const coupons = await database.shopCoupon.findMany({
    where: { shopId, isActive: true, startsAt: { lte: now }, expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" }, take: 60,
  });
  const items = await Promise.all(coupons.map(async coupon => {
    let eligible = false;
    let reason = "";
    let discount = 0;
    try {
      const result = await quoteCoupon(database, shopId, customerId, coupon.code, subtotal);
      eligible = true;
      discount = money(result.discountTotal);
    } catch (error) {
      reason = error.code === "COUPON_MINIMUM_ORDER"
        ? `Add ₹${money(Math.max(0, Number(coupon.minimumOrder) - subtotal)).toFixed(2)} more to unlock`
        : error.code === "COUPON_CUSTOMER_LIMIT" ? "Your usage limit is reached"
        : error.code === "COUPON_LIMIT_REACHED" ? "All redemptions have been used"
        : "Not available for this order";
    }
    return {
      id: coupon.id, code: coupon.code,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      minimumOrder: Number(coupon.minimumOrder),
      maxDiscount: coupon.maxDiscount === null ? null : Number(coupon.maxDiscount),
      expiresAt: coupon.expiresAt.toISOString(),
      perCustomerLimit: coupon.perCustomerLimit,
      eligible, reason, estimatedDiscount: discount,
    };
  }));
  items.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.estimatedDiscount - a.estimatedDiscount || a.minimumOrder - b.minimumOrder);
  const firstEligible = items.find(item => item.eligible && item.estimatedDiscount > 0);
  return { items: items.map(item => ({ ...item, recommended: item.id === firstEligible?.id })), shopName: lines[0].product.shop.name, subtotal };
}
