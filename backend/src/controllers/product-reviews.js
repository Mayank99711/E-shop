import { productReviewsService } from "../services/product-reviews.js";

function createError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function endpoint(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response);
    } catch (error) {
      next(error);
    }
  };
}

export function createProductReviewsController(service = productReviewsService) {
  return {
    create: endpoint(async (request, response) => {
      const result = await service.create(request.authUser.id, request.validatedBody);
      if (result.kind === "ineligible") {
        throw createError(403, "PURCHASE_NOT_ELIGIBLE", "A delivered purchase of this product is required to review it.");
      }
      if (result.kind === "duplicate") {
        throw createError(409, "REVIEW_ALREADY_EXISTS", "This purchase has already been reviewed.");
      }
      response.status(201).json({ review: result.review });
    }),

    list: endpoint(async (request, response) => {
      response.json(await service.list(request.authUser.id, request.validatedQuery));
    }),

    update: endpoint(async (request, response) => {
      const review = await service.update(request.authUser.id, request.params.reviewId, request.validatedBody);
      if (!review) throw createError(404, "REVIEW_NOT_FOUND", "Review not found.");
      response.json({ review });
    }),

    delete: endpoint(async (request, response) => {
      if (!await service.delete(request.authUser.id, request.params.reviewId)) {
        throw createError(404, "REVIEW_NOT_FOUND", "Review not found.");
      }
      response.status(204).end();
    })
  };
}

export const productReviewsController = createProductReviewsController();
