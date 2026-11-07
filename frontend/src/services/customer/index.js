import { apiRequest } from "../apiClient.js";

export { apiRequest, apiBaseUrl, resolveMediaUrl } from "../apiClient.js";

export const customerApi = {
  categories: () => apiRequest("/api/catalog/categories"),
  brands: () => apiRequest("/api/catalog/brands"),
  shops: () => apiRequest("/api/catalog/shops"),
  products: (query, options) =>
    apiRequest(`/api/catalog/products?${new URLSearchParams(query)}`, options),
  product: (id) => apiRequest(`/api/catalog/products/${id}`),
  productReviews: (productId, page = 1, limit = 5) =>
    apiRequest(
      `/api/catalog/products/${productId}/reviews?${new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })}`,
    ),

  myReviews: (page = 1, limit = 24) =>
    apiRequest(
      `/api/customer/reviews?${new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })}`,
    ),

  createReview: (body) =>
    apiRequest("/api/customer/reviews", {
      method: "POST",
      body,
    }),

  updateReview: (reviewId, body) =>
    apiRequest(`/api/customer/reviews/${reviewId}`, {
      method: "PATCH",
      body,
    }),

  deleteReview: (reviewId) =>
    apiRequest(`/api/customer/reviews/${reviewId}`, {
      method: "DELETE",
    }),
  favourites: () => apiRequest("/api/customer/favourites"),
  saveFavourite: (id) =>
    apiRequest(`/api/customer/favourites/${id}`, { method: "PUT" }),
  removeFavourite: (id) =>
    apiRequest(`/api/customer/favourites/${id}`, { method: "DELETE" }),
  cart: () => apiRequest("/api/customer/cart"),
  availableCartCoupons: () => apiRequest("/api/customer/cart/available-coupons"),
  addCartItem: (body) =>
    apiRequest("/api/customer/cart/items", { method: "POST", body }),
  updateCartItem: (id, quantity) =>
    apiRequest(`/api/customer/cart/items/${id}`, {
      method: "PATCH",
      body: { quantity },
    }),
  removeCartItem: (id) =>
    apiRequest(`/api/customer/cart/items/${id}`, { method: "DELETE" }),
  checkout: (body) =>
    apiRequest("/api/customer/checkout", { method: "POST", body }),
  checkoutQuote: (addressId, couponCode = "") =>
    apiRequest(
      `/api/customer/checkout/quote?${new URLSearchParams({ ...(addressId ? { addressId } : {}), ...(couponCode ? { couponCode } : {}) })}`,
    ),
  checkoutRazorpay: (body) =>
    apiRequest("/api/customer/checkout/razorpay", { method: "POST", body }),
  verifyRazorpayPayment: (body) =>
    apiRequest("/api/customer/checkout/razorpay/verify", {
      method: "POST",
      body,
    }),
  addresses: () => apiRequest("/api/customer/addresses"),
  createAddress: (body) =>
    apiRequest("/api/customer/addresses", { method: "POST", body }),
  updateAddress: (id, body) =>
    apiRequest(`/api/customer/addresses/${id}`, { method: "PATCH", body }),
  removeAddress: (id) =>
    apiRequest(`/api/customer/addresses/${id}`, { method: "DELETE" }),
  orders: () => apiRequest("/api/customer/orders"),
  order: (id) => apiRequest(`/api/customer/orders/${id}`),
  deletionRequest: () => apiRequest("/api/customer/account-deletion-request"),
  submitDeletionRequest: (body) =>
    apiRequest("/api/customer/account-deletion-request", {
      method: "POST",
      body,
    }),
  cancelDeletionRequest: () =>
    apiRequest("/api/customer/account-deletion-request", { method: "DELETE" }),
};
