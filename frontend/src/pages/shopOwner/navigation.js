export const shopOwnerNavigation = [
  { to: "/shop/coupons", label: "Coupons", icon: "payments" },

  // 1. Dashboard
  {
    to: "/shop/dashboard",
    label: "Dashboard",
    icon: "dashboard",
  },

  // 2. Wholesaler Management
  {
    label: "Wholesaler",
    icon: "wholesaler",
    children: [
      {
        to: "/shop/wholesalers",
        label: "Manage Wholesalers",
        icon: "wholesalers",
      },
    ],
  },

  // 3. Catalog Management
  {
    label: "Catalog",
    icon: "catalog",
    children: [
      {
        to: "/shop/catalog-requests/categories",
        label: "Categories",
        icon: "categories",
      },
      {
        to: "/shop/catalog-requests/subcategories",
        label: "Subcategories",
        icon: "subcategories",
      },
      {
        to: "/shop/catalog-requests/brands",
        label: "Brands",
        icon: "brands",
      },
      {
        to: "/shop/catalog-requests/attributes",
        label: "Variants / Attributes",
        icon: "variants",
      },
      {
        to: "/shop/products",
        label: "Products",
        icon: "products",
      },
    ],
  },

  // 4. Employee Management
  {
    label: "Employees",
    icon: "employees",
    children: [
      {
        to: "/shop/employees",
        label: "Employee Management",
        icon: "employees",
      },
      {
        to: "/shop/employee-access",
        label: "Access Management",
        icon: "employees",
      },
      {
        to: "/shop/employee-attendance",
        label: "Attendance",
        icon: "attendance",
      },
      {
        to: "/shop/employee-salary",
        label: "Salary",
        icon: "salary",
      },
      {
        to: "/shop/employee-payroll",
        label: "Payroll",
        icon: "payroll",
      },
    ],
  },

  // 5. Order Management
  {
    to: "/shop/orders",
    label: "Orders",
    icon: "orders",
  },

  // 6. Payments
  {
    to: "/shop/payments",
    label: "Payments",
    icon: "payments",
  },

  // 7. Delivery Management
  {
    to: "/shop/delivery-management",
    label: "Delivery Management",
    icon: "delivery",
  },

  { to: "/shop/returns-management", label: "Returns", icon: "delivery" },

  // 8. Reports
  {
    to: "/shop/reports",
    label: "Reports",
    icon: "reports",
  },

  // 9. Inventory Management
  {
    to: "/shop/inventory",
    label: "Inventory",
    icon: "inventory",
  },

  // 10. Customer Store
  {
    to: "/shop/customer-store",
    label: "Customer Store",
    icon: "store",
  },
];

// Keep existing bottom navigation
export const shopOwnerBottomNavigation = [
  {
    to: "/shop/settings",
    label: "Settings",
    icon: "settings",
  },
  {
    to: "/shop/profile",
    label: "My Profile",
    icon: "profile",
  },
];
