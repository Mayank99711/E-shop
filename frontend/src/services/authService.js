import { apiRequest } from "./apiClient.js";

export const authService = {
  restoreSession: () => apiRequest("/api/auth/me"),
  updateProfile: (body) => apiRequest("/api/auth/me", { method: "PATCH", body }),
  changePassword: (body) => apiRequest("/api/auth/change-password", { method: "POST", body }),
  login: ({ role, email, password, rememberMe = false }) => apiRequest("/api/auth/login", {
    method: "POST",
    body: { role, email, password, rememberMe },
    portal: (role === "SHOP_OWNER" || role === "SHOP_EMPLOYEE") ? "shop-owner" : role === "SUPER_ADMIN" ? "super-admin" : "customer"
  }),
  logout: () => apiRequest("/api/auth/logout", { method: "POST" }),
  forgotPassword: (email) => apiRequest("/api/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token, password) => apiRequest("/api/auth/reset-password", { method: "POST", body: { token, password } }),
  activateEmployee: (token, password) => apiRequest("/api/auth/activate-employee", { method: "POST", body: { token, password }, portal: "shop-owner" }),
  activateOwner: (token, password) => apiRequest("/api/auth/activate-owner", { method: "POST", body: { token, password } }),
  registerCustomer: (details) => apiRequest("/api/auth/register", { method: "POST", body: details }),
  verifyCustomerEmail: (email, code) => apiRequest("/api/auth/verify-email", { method: "POST", body: { email, code } }),
  resendCustomerVerification: (email) => apiRequest("/api/auth/resend-verification", { method: "POST", body: { email } })
};
