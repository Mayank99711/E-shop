import { prisma } from "../config/database.js";
import { productSelection, attachProductRatings } from "./catalog.js";

export function createCustomerCommerceService(database = prisma) {
  async function getFavourites(customerId) {
    return database.favourite.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        product: { select: productSelection },
      },
    });
  }

  async function addFavourite(customerId, productId) {
    const product = await database.product.findFirst({
      where: { id: productId, status: "ACTIVE", shop: { status: "ACTIVE" } },
      select: { id: true },
    });
    if (!product) return null;
    return database.favourite.upsert({
      where: { customerId_productId: { customerId, productId: product.id } },
      create: { customerId, productId: product.id },
      update: {},
      select: { id: true, productId: true, createdAt: true },
    });
  }

  async function removeFavourite(customerId, productId) {
    return database.favourite.deleteMany({ where: { customerId, productId } });
  }

  async function getCart(
    transaction,
    customerId,
    { includeRatings = true } = {},
  ) {
    const cart = await transaction.cart.findUnique({
      where: { customerId },
      select: { id: true },
    });
    if (!cart) return { id: null, items: [] };
    const items = await transaction.cartItem.findMany({
      where: { cartId: cart.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        quantity: true,
        productId: true,
        variantId: true,
        product: { select: productSelection },
        variant: {
          select: {
            id: true,
            sku: true,
            price: true,
            discountPrice: true,
            stock: true,
            isActive: true,

            // Selected variant's color and size information
            values: {
              select: {
                attribute: {
                  select: {
                    name: true,
                  },
                },
                value: {
                  select: {
                    id: true,
                    value: true,
                  },
                },
              },
            },

            shop: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });

    const ratingsByProductId = new Map();

    if (includeRatings && items.length > 0) {
      const uniqueProducts = [
        ...new Map(
          items.map((item) => [item.product.id, item.product]),
        ).values(),
      ];

      const ratedProducts = await attachProductRatings(
        uniqueProducts,
        transaction,
      );

      for (const product of ratedProducts) {
        ratingsByProductId.set(product.id, {
          averageRating: product.averageRating,
          reviewCount: product.reviewCount,
        });
      }
    }
    return {
      id: cart.id,
      items: items.map((item) => ({
        ...item,
        product: {
          ...item.product,
          averageRating:
            ratingsByProductId.get(item.product.id)?.averageRating ?? 0,
          reviewCount:
            ratingsByProductId.get(item.product.id)?.reviewCount ?? 0,
        },
        available:
          item.product.status === "ACTIVE" &&
          item.variant.stock >= item.quantity &&
          item.variant.isActive &&
          item.variant.shop.status === "ACTIVE",
      })),
    };
  }

  async function readCart(customerId, options = {}) {
    return database.$transaction((transaction) =>
      getCart(transaction, customerId, options),
    );
  }

  async function addCartItem(customerId, variantId, quantity) {
    const variant = await database.productVariant.findFirst({
      where: {
        id: variantId,
        isActive: true,
        product: { status: "ACTIVE" },
        shop: { status: "ACTIVE" },
      },
      select: { id: true, productId: true, stock: true },
    });
    if (!variant) return { kind: "unavailable" };
    return database.$transaction(async (tx) => {
      const cart = await tx.cart.upsert({
        where: { customerId },
        create: { customerId },
        update: {},
        select: { id: true },
      });
      const key = { cartId_variantId: { cartId: cart.id, variantId } };
      const current = await tx.cartItem.findUnique({
        where: key,
        select: { quantity: true },
      });
      const nextQuantity = (current?.quantity || 0) + quantity;
      if (nextQuantity > variant.stock) return { kind: "stock" };
      const item = await tx.cartItem.upsert({
        where: key,
        create: {
          cartId: cart.id,
          productId: variant.productId,
          variantId,
          quantity,
        },
        update: { quantity: nextQuantity },
        select: { id: true, productId: true, variantId: true, quantity: true },
      });
      return { kind: "ok", item };
    });
  }

  async function updateCartItem(customerId, itemId, quantity) {
    const cart = await database.cart.findUnique({
      where: { customerId },
      select: { id: true },
    });
    if (!cart) return { kind: "missing" };
    const item = await database.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      select: {
        id: true,
        variant: {
          select: {
            stock: true,
            isActive: true,
            shop: { select: { status: true } },
          },
        },
      },
    });
    if (!item) return { kind: "missing" };
    if (
      !item.variant.isActive ||
      item.variant.shop.status !== "ACTIVE" ||
      quantity > item.variant.stock
    )
      return { kind: "stock" };
    return {
      kind: "ok",
      item: await database.cartItem.update({
        where: { id: item.id },
        data: { quantity },
        select: { id: true, productId: true, variantId: true, quantity: true },
      }),
    };
  }

  async function removeCartItem(customerId, itemId) {
    const cart = await database.cart.findUnique({
      where: { customerId },
      select: { id: true },
    });
    if (!cart) return false;
    await database.cartItem.deleteMany({
      where: { id: itemId, cartId: cart.id },
    });
    return true;
  }

  async function validateCheckoutCart(customerId) {
    const cart = await readCart(customerId, {
      includeRatings: false,
    });
    const items = cart.items.map((item) => {
      const variant = item.variant;
      const unitPrice = Number(variant.discountPrice ?? variant.price);
      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice,
        lineTotal: unitPrice * item.quantity,
        available: item.available,
      };
    });

    const issues = [];
    if (items.length === 0) {
      issues.push({ code: "CART_EMPTY", message: "Your cart is empty." });
    }
    for (const item of items) {
      if (!item.available) {
        issues.push({
          itemId: item.id,
          code: "CART_ITEM_UNAVAILABLE",
          message: "This cart item is no longer available or is out of stock.",
        });
      }
    }

    const total = items
      .filter((item) => item.available)
      .reduce((sum, item) => sum + item.lineTotal, 0);

    return {
      cartId: cart.id,
      items,
      issues,
      available: issues.length === 0,
      total,
    };
  }
  return {
    getFavourites,
    addFavourite,
    removeFavourite,
    getCart,
    readCart,
    addCartItem,
    updateCartItem,
    removeCartItem,
    validateCheckoutCart,
  };
}

export const customerCommerceService = createCustomerCommerceService();
