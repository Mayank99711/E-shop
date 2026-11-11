export const adminNavigation = [
  { to: "/admin/dashboard", label: "Dashboard" },
  {
    label: "Shops",
    children: [
      { to: "/admin/shop-categories", label: "Shop Categories" },
      { to: "/admin/shops", label: "Manage Shops & Owners" },
      { to: "/admin/employees", label: "Manage Employees" },
      { to: "/admin/commission", label: "Commission" },
      { to: "/admin/orders", label: "Orders" },
      { to: "/admin/coupons", label: "Coupons" },
      { to: "/admin/reports", label: "Reports" },
    ],
  },
  {
    label: "Catalog",
    children: [
      { to: "/admin/categories", label: "Manage Categories" },
      { to: "/admin/subcategories", label: "Manage Subcategories" },
      { to: "/admin/brands", label: "Manage Brands" },
      { to: "/admin/variants", label: "Manage Variants / Attributes" },
      { to: "/admin/products", label: "Manage Products" },
    ],
  },
  { to: "/admin/wholesalers", label: "Wholesalers" },
  { to: "/admin/audit-logs", label: "Audit Logs" },
  { to: "/admin/data-requests", label: "Data requests" },
  { to: "/admin/account-requests", label: "Account requests" },
  { to: "/admin/profile", label: "My Profile" },
  { to: "/admin/settings", label: "Settings" },
];
