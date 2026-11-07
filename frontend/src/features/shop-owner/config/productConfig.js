// Allowed order transitions; backend and Prisma must agree.
export const nextOrderStatus = {
  PLACED: "CONFIRMED",
  CONFIRMED: "PAYMENT_PROCESSING",
  PAYMENT_PROCESSING: "INVENTORY_ALLOCATED",
  INVENTORY_ALLOCATED: "PICKING",
  PICKING: "PACKED",
  PACKED: "SHIPPED",
  SHIPPED: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};
export const orderStatuses = ["PLACED", "CONFIRMED", "PAYMENT_PROCESSING", "INVENTORY_ALLOCATED", "PICKING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURN_REQUESTED", "RETURNED", "REFUND_PENDING", "REFUNDED"];
export const maxProductImages = 10;
export const maxImagesPerUpload = 6;
export const maxProductImageBytes = 5 * 1024 * 1024;
export const productImageTypes = ["image/jpeg", "image/png", "image/webp"];
