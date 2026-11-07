import { apiRequest } from "../apiClient.js";

export const adminApi = {
  coupons: () => apiRequest('/api/admin/coupons'),
  dashboard: () => apiRequest("/api/admin/dashboard"),
  shops: () => apiRequest("/api/admin/shops?limit=100"),
  employees: () => apiRequest("/api/admin/employees"),
  commissions: () => apiRequest("/api/admin/commissions"),
  orders: () => apiRequest("/api/admin/orders"),
  products: () => apiRequest("/api/admin/products"),
  auditLogs: () => apiRequest("/api/admin/audit-logs"),
  uploadBrandImage: async (file) => {
    if (!file) throw new Error("Please select an image.");
    const formData = new FormData();
    formData.append("image", file);
    const result = await apiRequest("/api/admin/brand-images", { method: "POST", body: formData });
    return result.data.imageUrl;
  },
  uploadShopCategoryImage: async (file) => {
    if (!file) throw new Error("Please select an image.");
    const formData = new FormData();
    formData.append("image", file);
    const result = await apiRequest("/api/admin/shop-category-images", { method: "POST", body: formData });
    return result.data.imageUrl;
  },
  uploadCategoryImage: async (file, imageType) => {
    const allowedTypes = ["categoryIcon", "categoryImage"];
    if (!allowedTypes.includes(imageType)) throw new Error("Invalid image type.");
    if (!file) throw new Error("Please select an image.");
    const formData = new FormData();
    formData.append("image", file);
    const result = await apiRequest(`/api/admin/category-images/${imageType}`, { method: "POST", body: formData });
    return result.data.imageUrl;
  },
  shopCategories: () => apiRequest("/api/admin/shop-categories"),
  createShopCategory: (body) => apiRequest("/api/admin/shop-categories", { method: "POST", body }),
  updateShopCategory: (id, body) => apiRequest(`/api/admin/shop-categories/${id}`, { method: "PATCH", body }),
  setShopCategoryStatus: (id, isActive) => apiRequest(`/api/admin/shop-categories/${id}/status`, { method: "PATCH", body: { isActive } }),
  categories: () => apiRequest("/api/admin/categories"),
  brands: () => apiRequest("/api/admin/brands"),
  variants: () => apiRequest("/api/admin/variant-attributes"),
  requests: () => apiRequest("/api/admin/master-data-requests?limit=100"),
  accountRequests: () => apiRequest("/api/admin/account-deletion-requests?limit=100"),
  profile: () => apiRequest("/api/auth/me"),
  createShop: (body) => apiRequest("/api/admin/shops", { method: "POST", body }),
  setShopStatus: (id, status) => apiRequest(`/api/admin/shops/${id}/status`, { method: "PATCH", body: { status } }),
  updateShop: (id, body) => apiRequest(`/api/admin/shops/${id}`, { method: "PATCH", body }),
  setProductStatus: (id, status) => apiRequest(`/api/admin/products/${id}/status`, { method: "PATCH", body: { status } }),
  resendShopActivation: (id) => apiRequest(`/api/admin/shops/${id}/resend-activation`, { method: "POST" }),
  createCategory: (body) => apiRequest("/api/admin/categories", { method: "POST", body }),
  updateCategory: (id, body) => apiRequest(`/api/admin/categories/${id}`, { method: "PATCH", body }),
  setCategoryStatus: (id, isActive) => apiRequest(`/api/admin/categories/${id}/status`, { method: "PATCH", body: { isActive } }),
  createBrand: (body) => apiRequest("/api/admin/brands", { method: "POST", body }),
  updateBrand: (id, body) => apiRequest(`/api/admin/brands/${id}`, { method: "PATCH", body }),
  createVariantAttribute: (body) => apiRequest("/api/admin/variant-attributes", { method: "POST", body }),
  uploadVariantAttributeImage: async (file) => {
    if (!file) throw new Error("Please select an image.");
    const formData = new FormData();
    formData.append("image", file);
    const result = await apiRequest("/api/admin/variant-attribute-images", { method: "POST", body: formData });
    return result.data.imageUrl;
  },
  updateVariantAttribute: (id, body) => apiRequest(`/api/admin/variant-attributes/${id}`, { method: "PATCH", body }),
  createVariantValue: (attributeId, value) => apiRequest(`/api/admin/variant-attributes/${attributeId}/values`, { method: "POST", body: { value } }),
  updateVariantValue: (attributeId, valueId, body) => apiRequest(`/api/admin/variant-attributes/${attributeId}/values/${valueId}`, { method: "PATCH", body }),
  reviewMasterDataRequest: (id, body) => apiRequest(`/api/admin/master-data-requests/${id}`, { method: "PATCH", body }),
  reviewAccountDeletionRequest: (id, body) => apiRequest(`/api/admin/account-deletion-requests/${id}`, { method: "PATCH", body }),
  wholesalers: () => apiRequest("/api/admin/wholesalers?limit=100"),
  shopWholesalers: (shopId) => apiRequest(`/api/admin/shops/${shopId}/wholesalers`),
  createWholesaler: (body) => apiRequest("/api/admin/wholesalers", { method: "POST", body }),
  updateWholesaler: (id, body) => apiRequest(`/api/admin/wholesalers/${id}`, { method: "PATCH", body }),
  assignShopWholesaler: (shopId, wholesalerId) => apiRequest(`/api/admin/shops/${shopId}/wholesalers`, { method: "POST", body: { wholesalerId } }),
  revokeShopWholesaler: (shopId, wholesalerId) => apiRequest(`/api/admin/shops/${shopId}/wholesalers/${wholesalerId}`, { method: "DELETE" })
};


export function getAdminResource(view) {
  const resource = {
    coupons: adminApi.coupons,
    dashboard: adminApi.dashboard, shops: adminApi.shops,
    categories: adminApi.categories, subcategories: adminApi.categories,
    "shop-categories": adminApi.shopCategories,
    employees: adminApi.employees, commission: adminApi.commissions,
    orders: adminApi.orders, products: adminApi.products, "audit-logs": adminApi.auditLogs,
    brands: adminApi.brands, variants: adminApi.variants,
    requests: adminApi.requests, "account-deletions": adminApi.accountRequests,
    profile: adminApi.profile, reports: adminApi.dashboard, settings: adminApi.profile,
    wholesalers: adminApi.wholesalers, "shop-wholesaler-access": adminApi.wholesalers
  }[view];
  if (!resource) throw new Error(`Unknown admin view: ${view}`);
  return resource();
}
