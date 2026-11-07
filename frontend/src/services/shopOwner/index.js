import { apiRequest, resolveMediaUrl } from "../apiClient.js";

export { apiRequest, resolveMediaUrl };

export const shopOwnerApi = {
  coupons: () => apiRequest('/api/owner/coupons'),
  couponUsage: id => apiRequest('/api/owner/coupons/'+encodeURIComponent(id)+'/usage'),
  createCoupon: body => apiRequest('/api/owner/coupons', {method:'POST',body}),
  updateCoupon: (id,body) => apiRequest('/api/owner/coupons/'+id, {method:'PATCH',body}),
  wholesalers: () => apiRequest("/api/owner/wholesalers"),
  registerWholesaler: (body) =>
    apiRequest("/api/owner/wholesalers", { method: "POST", body }),
  updateWholesalerDetails: (id,body) => apiRequest(`/api/owner/wholesalers/${id}/details`,{method:"PATCH",body}),
  setWholesalerStatus: (id,isActive) => apiRequest(`/api/owner/wholesalers/${id}/status`,{method:"PATCH",body:{isActive}}),
  updatePurchaseOrderDate: (id,body) => apiRequest(`/api/owner/purchase-orders/${id}/expected-date`,{method:"PATCH",body}),
  updateBillNotes: (id,body) => apiRequest(`/api/owner/wholesale-bills/${id}/notes`,{method:"PATCH",body}),
  updatePaymentNotes: (id,body) => apiRequest(`/api/owner/wholesale-payments/${id}/notes`,{method:"PATCH",body}),
  wholesalePayments: () => apiRequest("/api/owner/wholesale-payments"),

  recordWholesalePayment: (body) =>
    apiRequest("/api/owner/wholesale-payments", {
      method: "POST",
      body,
    }),
  createPurchaseOrder: (body) =>
    apiRequest("/api/owner/purchase-orders", { method: "POST", body }),
  wholesaleBills: () => apiRequest("/api/owner/wholesale-bills"),

  uploadWholesaleBill: (formData) =>
    apiRequest("/api/owner/wholesale-bills", {
      method: "POST",
      body: formData,
    }),
  purchaseOrders: () => apiRequest("/api/owner/purchase-orders"),
  purchaseOrder: (id) => apiRequest(`/api/owner/purchase-orders/${id}`),
  createGoodsReceipt: (poId, body) =>
    apiRequest(`/api/owner/purchase-orders/${poId}/receipts`, {
      method: "POST",
      body,
    }),
  goodsReceipts: (poId) =>
    apiRequest(`/api/owner/purchase-orders/${poId}/receipts`),
  goodsReceipt: (id) => apiRequest(`/api/owner/goods-receipts/${id}`),
  confirmGoodsReceipt: (id) =>
    apiRequest(`/api/owner/goods-receipts/${id}/confirm`, { method: "POST" }),
  payments: () => apiRequest("/api/owner/payments"),
  reports: () => apiRequest("/api/owner/reports"),
  products: () => apiRequest("/api/owner/products"),
  createProduct: (body) =>
    apiRequest("/api/owner/products", { method: "POST", body }),
  updateProduct: (id, body) =>
    apiRequest(`/api/owner/products/${id}`, { method: "PATCH", body }),
  setProductStatus: (id, status) =>
    apiRequest(`/api/owner/products/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),
  addProductVariants: (id, body) =>
    apiRequest(`/api/owner/products/${id}/variants`, { method: "POST", body }),
  updateVariant: (id, body) =>
    apiRequest(`/api/owner/variants/${id}`, { method: "PATCH", body }),
  uploadProductImages: (id, body) =>
    apiRequest(`/api/owner/products/${id}/images`, { method: "POST", body }),
  removeProductImage: (productId, imageId) =>
    apiRequest(`/api/owner/products/${productId}/images/${imageId}`, {
      method: "DELETE",
    }),
  setOrderStatus: (id, status, note) =>
    apiRequest(`/api/owner/orders/${id}/status`, {
      method: "PATCH",
      body: { status, note },
    }),
  listEmployeeRoles: () => apiRequest("/api/owner/employee-roles"),
  createEmployeeRole: (body) =>
    apiRequest("/api/owner/employee-roles", { method: "POST", body }),
  createEmployee: (body) =>
    apiRequest("/api/owner/employees", { method: "POST", body }),
  updateEmployeeDetails: (id, body) => apiRequest(`/api/owner/employees/${id}/details`, { method: "PATCH", body }),
  updateEmployee: (id, body) =>
    apiRequest(`/api/owner/employees/${id}`, { method: "PATCH", body }),

  // Assign or change employee role
  assignEmployeeRole: (employeeId, employeeRole) =>
    apiRequest(`/api/owner/employees/${employeeId}/role`, {
      method: "PATCH",
      body: { employeeRole },
    }),
  getEmployeePermissions: (employeeId) =>
    apiRequest(`/api/owner/employees/${employeeId}/permissions`),

  // Save employee-specific permissions
  updateEmployeePermissions: (employeeId, permissions) =>
    apiRequest(`/api/owner/employees/${employeeId}/permissions`, {
      method: "PATCH",
      body: { permissions },
    }),
  createEmployeeLoginAccount: (id) => apiRequest(`/api/owner/employees/${id}/login-account`, { method: "POST" }),
  sendEmployeeActivation: (id) => apiRequest(`/api/owner/employees/${id}/send-activation`, { method: "POST" }),
  employeeAttendance: (employeeId, query = "") =>
    apiRequest(`/api/owner/employees/${employeeId}/attendance${query}`),
  recordAttendance: (employeeId, body) =>
    apiRequest(`/api/owner/employees/${employeeId}/attendance`, {
      method: "POST",
      body,
    }),
  updateAttendance: (employeeId, attendanceId, body) =>
    apiRequest(
      `/api/owner/employees/${employeeId}/attendance/${attendanceId}`,
      { method: "PATCH", body },
    ),
  employeePayrollPeriods: (employeeId) =>
    apiRequest(`/api/owner/employees/${employeeId}/payroll-periods`),
  createPayrollPeriod: (employeeId, body) =>
    apiRequest(`/api/owner/employees/${employeeId}/payroll-periods`, {
      method: "POST",
      body,
    }),
  payrollPayments: (periodId) =>
    apiRequest(`/api/owner/payroll-periods/${periodId}/payments`),
  recordPayrollPayment: (periodId, body) =>
    apiRequest(`/api/owner/payroll-periods/${periodId}/payments`, {
      method: "POST",
      body,
    }),
  addEmployeeSalary: (id, body) =>
    apiRequest(`/api/owner/employees/${id}/salary-history`, {
      method: "POST",
      body,
    }),
  updateShopProfile: (body) =>
    apiRequest("/api/owner/shop", { method: "PATCH", body }),
};

export async function loadOwnerWorkspace() {
  const [dashboard, products, options, requests, employees, orders] =
    await Promise.all([
      apiRequest("/api/owner/dashboard"),
      apiRequest("/api/owner/products"),
      apiRequest("/api/owner/catalog-options"),
      apiRequest("/api/owner/master-data-requests"),
      apiRequest("/api/owner/employees"),
      apiRequest("/api/owner/orders"),
    ]);
  return {
    dashboard,
    products: products.items,
    options,
    requests: requests.items,
    employees: employees.items,
    orders: orders.items,
  };
}
