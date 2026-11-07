import { prisma } from "../config/database.js";

const reviewSelection = {
  id: true,
  customerId: true,
  productId: true,
  orderItemId: true,
  rating: true,
  title: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { id: true, name: true } },
};

function isOrderItemUniqueViolation(error) {
  return (
    error?.code === "P2002" &&
    (!error.meta?.target ||
      error.meta.target.includes("orderItemId") ||
      error.meta.target.includes("ProductReview_orderItemId_key"))
  );
}

export function createProductReviewsService(database = prisma) {
  return {
    async listPublic(productId, { page, limit }) {
      // Only public, active products can expose reviews.
      const product = await database.product.findFirst({
        where: {
          id: productId,
          status: "ACTIVE",
          shop: { status: "ACTIVE" },
          variants: { some: { isActive: true } },
        },
        select: { id: true },
      });

      if (!product) return null;

      const where = { productId };

      const [reviews, total, ratingGroups] = await Promise.all([
        database.productReview.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            rating: true,
            title: true,
            comment: true,
            createdAt: true,
            updatedAt: true,
          },
        }),

        database.productReview.count({ where }),

        database.productReview.groupBy({
          by: ["rating"],
          where,
          _count: { rating: true },
        }),
      ]);

      const distribution = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0,
      };

      for (const group of ratingGroups) {
        if (group.rating >= 1 && group.rating <= 5) {
          distribution[group.rating] = group._count.rating;
        }
      }

      const ratingTotal = ratingGroups.reduce(
        (sum, group) => sum + group.rating * group._count.rating,
        0,
      );

      return {
        items: reviews,
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        averageRating: total ? Number((ratingTotal / total).toFixed(1)) : 0,
        distribution,
      };
    },

    async create(customerId, input) {
      const eligibleOrderItem = await database.orderItem.findFirst({
        where: {
          id: input.orderItemId,
          productId: input.productId,
          shopOrder: {
            status: "DELIVERED",
            order: { customerId },
          },
        },
        select: { id: true },
      });
      if (!eligibleOrderItem) return { kind: "ineligible" };

      try {
        const review = await database.productReview.create({
          data: {
            customerId,
            productId: input.productId,
            orderItemId: eligibleOrderItem.id,
            rating: input.rating,
            title: input.title,
            comment: input.comment,
          },
          select: reviewSelection,
        });
        return { kind: "created", review };
      } catch (error) {
        if (isOrderItemUniqueViolation(error)) return { kind: "duplicate" };
        throw error;
      }
    },

    async list(customerId, { page, limit }) {
      const where = { customerId };
      const [items, total] = await Promise.all([
        database.productReview.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
          select: reviewSelection,
        }),
        database.productReview.count({ where }),
      ]);
      return { items, page, limit, total, pages: Math.ceil(total / limit) };
    },

    async update(customerId, reviewId, input) {
      const result = await database.productReview.updateMany({
        where: { id: reviewId, customerId },
        data: input,
      });
      if (result.count === 0) return null;

      return database.productReview.findFirst({
        where: { id: reviewId, customerId },
        select: reviewSelection,
      });
    },

    async delete(customerId, reviewId) {
      const result = await database.productReview.deleteMany({
        where: { id: reviewId, customerId },
      });
      return result.count > 0;
    },
  };
}

export const productReviewsService = createProductReviewsService();
