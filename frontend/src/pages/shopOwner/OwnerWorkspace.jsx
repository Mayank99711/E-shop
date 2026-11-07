import { lazy, Suspense, useEffect, useState } from "react";
import { apiRequest, shopOwnerApi } from '../../services/shopOwner/index.js';
import { resetInFlightRequests } from '../../services/apiClient.js';
import { CustomerStorePreview } from '../../features/shop-owner/store-preview/CustomerStorePage.jsx';
import { useLocation, useNavigate } from "react-router-dom";

const CouponsPage = lazy(() => import('../../features/shop-owner/coupons/CouponsPage.jsx'));
const Overview = lazy(() => import('../../features/shop-owner/dashboard/DashboardPage.jsx').then((module) => ({ default: module.Overview })));
const OwnerProfile = lazy(() => import('../../features/shop-owner/profile/ProfilePage.jsx').then((module) => ({ default: module.OwnerProfile })));
const OwnerShopProfile = lazy(() => import('../../features/shop-owner/shop-profile/ShopProfilePage.jsx').then((module) => ({ default: module.OwnerShopProfile })));
const OwnerSettings = lazy(() => import('../../features/shop-owner/settings/SettingsPage.jsx').then((module) => ({ default: module.OwnerSettings })));
const ProductsSection = lazy(() => import('../../features/shop-owner/products/ProductsPage.jsx').then((module) => ({ default: module.ProductsSection })));
const CategoryRequestsPage = lazy(() => import('../../features/shop-owner/catalog-requests/CategoriesPage.jsx'));
const SubcategoryRequestsPage = lazy(() => import('../../features/shop-owner/catalog-requests/SubcategoriesPage.jsx'));
const BrandRequestsPage = lazy(() => import('../../features/shop-owner/catalog-requests/BrandsPage.jsx'));
const VariantRequestsPage = lazy(() => import('../../features/shop-owner/catalog-requests/VariantsPage.jsx'));
const OwnerEmployeeAccess = lazy(() => import('../../features/shop-owner/employees/OwnerEmployeeAccess.jsx'));
const OwnerReturnManagement = lazy(() => import('../../features/shop-owner/returns/OwnerReturnManagement.jsx'));
const OwnerDeliveryAssignments = lazy(() => import('../../features/shop-owner/delivery/OwnerDeliveryAssignments.jsx'));
const EmployeesSection = lazy(() => import('../../features/shop-owner/employees/EmployeesPage.jsx').then((module) => ({ default: module.EmployeesSection })));
const AttendancePage = lazy(() =>
  import("../../features/shop-owner/attendance/AttendancePage.jsx")
);
const OrdersSection = lazy(() => import('../../features/shop-owner/orders/OrdersPage.jsx').then((module) => ({ default: module.OrdersSection })));
const PurchaseOrdersSection = lazy(() => import('../../features/shop-owner/purchase-orders/PurchaseOrdersPage.jsx').then((module) => ({ default: module.PurchaseOrdersSection })));
const OwnerWholesalers = lazy(() => import('../../features/shop-owner/wholesalers/WholesalersPage.jsx').then((module) => ({ default: module.OwnerWholesalers })));
const PaymentsPage = lazy(() => import('../../features/shop-owner/payments/PaymentsPage.jsx'));
const ReportsPage = lazy(() => import('../../features/shop-owner/reports/ReportsPage.jsx'));
const InventoryPage = lazy(() => import('../../features/shop-owner/inventory/InventoryPage.jsx'));

const emptyData = {
  dashboard: null,
  products: [],
  payments: [],
  reports: null,
  options: { categories: [], brands: [], attributes: [] },
  requests: [],
  employees: [],
  orders: []
};

export default function OwnerWorkspace({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const pathToTab = {
    "/shop/dashboard": "overview",
    "/shop/customer-store": "customer-store",
    "/shop/products": "products",
    "/shop/catalog-requests": "request-categories",
    "/shop/catalog-requests/categories": "request-categories",
    "/shop/catalog-requests/subcategories": "request-subcategories",
    "/shop/catalog-requests/brands": "request-brands",
    "/shop/catalog-requests/attributes": "request-attributes",
    "/shop/catalog-requests/products": "manage-products",
    "/shop/employees": "employees",
    "/shop/employee-access": "employee-access",
    "/shop/employee-attendance": "employee-attendance",
    "/shop/employee-salary": "employee-salary",
    "/shop/employee-payroll": "employee-payroll",
    "/shop/orders": "orders",
    "/shop/returns-management": "returns-management",
    "/shop/delivery-management": "delivery-management",
    "/shop/coupons": "coupons",
    "/shop/payments": "payments",
    "/shop/inventory": "inventory",
    "/shop/reports": "reports",
    "/shop/purchase-orders": "purchase-orders",
    "/shop/wholesalers": "wholesalers",
    "/shop/shop-profile": "shop-profile",
    "/shop/profile": "profile",
    "/shop/settings": "settings"
  };
  const pathForTab = {
    overview: "/shop/dashboard",
    "customer-store": "/shop/customer-store",
    products: "/shop/products",
    "request-categories": "/shop/catalog-requests/categories",
    "request-subcategories": "/shop/catalog-requests/subcategories",
    "request-brands": "/shop/catalog-requests/brands",
    "request-attributes": "/shop/catalog-requests/attributes",
    "manage-products": "/shop/catalog-requests/products",
    employees: "/shop/employees",
    "employee-access": "/shop/employee-access",
    "employee-attendance": "/shop/employee-attendance",
    "employee-salary": "/shop/employee-salary",
    "employee-payroll": "/shop/employee-payroll",
    orders: "/shop/orders",
    "returns-management": "/shop/returns-management",
    "delivery-management": "/shop/delivery-management",
    coupons: "/shop/coupons",
    payments: "/shop/payments",
    inventory: "/shop/inventory",
    reports: "/shop/reports",
    "purchase-orders": "/shop/purchase-orders",
    wholesalers: "/shop/wholesalers",
    "shop-profile": "/shop/shop-profile",
    profile: "/shop/profile",
    settings: "/shop/settings"
  };
  const [activeTab, setActiveTab] = useState(pathToTab[location.pathname] || "overview");
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [errorTab, setErrorTab] = useState("");
  //syccess message auto-hide after 3second

  useEffect(() => {
  if (!notice) return;

  const timer = setTimeout(() => {
    setNotice("");
  }, 3000);

  return () => clearTimeout(timer);
}, [notice]);

// Existing useEffect — keep unchanged
  useEffect(() => {
    const nextTab = pathToTab[location.pathname];
    if (nextTab && nextTab !== activeTab) setActiveTab(nextTab);
  }, [activeTab, location.pathname]);
  function selectTab(nextTab) {
    setActiveTab(nextTab);
    setError("");
    setErrorTab("");
    setNotice("");
    navigate(pathForTab[nextTab]);
  }

  const [loadedTabs, setLoadedTabs] = useState(new Set());

  async function loadModule(tab, force = false) {
    if (!force && loadedTabs.has(tab)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setErrorTab("");
    try {
      let patch = {};
      if (tab === "overview") {
        const [dashboard, products, orders] = await Promise.all([
          apiRequest("/api/owner/dashboard"),
          apiRequest("/api/owner/products"),
          apiRequest("/api/owner/orders")
        ]);
        patch = { dashboard, products: products.items, orders: orders.items };
      } else if (tab === "customer-store") {
        const [dashboard, products] = await Promise.all([
          apiRequest("/api/owner/dashboard"),
          apiRequest("/api/owner/products")
        ]);
        patch = { dashboard, products: products.items };
      } else if (tab === "products" || tab === "manage-products") {
        const [products, options] = await Promise.all([
          apiRequest("/api/owner/products"),
          apiRequest("/api/owner/catalog-options")
        ]);
        patch = { products: products.items, options };
      } else if (tab.startsWith("request-")) {
        const [requests, options] = await Promise.all([
          apiRequest("/api/owner/master-data-requests"),
          apiRequest("/api/owner/catalog-options")
        ]);
        patch = { requests: requests.items, options };
      } else if (tab === "employee-access") {
        patch = {};
      } else if (tab === "employees" || tab === "employee-attendance" || tab === "employee-salary" || tab === "employee-payroll") {
        const employees = await apiRequest("/api/owner/employees");
        patch = { employees: employees.items };
      } else if (tab === "returns-management") {
        patch = {};
      } else if (tab === "delivery-management") {
        patch = {};
      } else if (tab === "orders") {
        const orders = await apiRequest("/api/owner/orders");
        patch = { orders: orders.items };
      } else if (tab === "inventory") {
        const [products, options] = await Promise.all([
          apiRequest("/api/owner/products"),
          apiRequest("/api/owner/catalog-options")
        ]);
        patch = { products: products.items, options };
      } else if (tab === "payments") {
        const payments = await shopOwnerApi.payments();
        patch = { payments: payments.items };
      } else if (tab === "reports") {
        patch = { reports: await shopOwnerApi.reports() };
      } else if (tab === "shop-profile") {
        const dashboard = await apiRequest("/api/owner/dashboard");
        patch = { dashboard };
      } else {
        setLoading(false);
        return;
      }

      setData((current) => ({ ...current, ...patch }));
      setLoadedTabs((current) => new Set(current).add(tab));
    } catch (requestError) {
      if (requestError.status === 403) {
        resetInFlightRequests();
        setLoadedTabs(new Set());
        setData(emptyData);
        navigate("/shop/login", { replace: true });
        return;
      }
      setError(requestError.message);
      setErrorTab(activeTab);
    } finally {
      setLoading(false);
    }
  }

  const loadWorkspace = (force = false) => loadModule(activeTab, force);

  useEffect(() => {
    loadModule(activeTab);
  }, [activeTab]);

  async function submit(action, successMessage) {
    setBusy(true);
    setError("");
    setErrorTab("");
    setNotice("");
    try {
      const result = await action();
      setNotice(successMessage);
      await loadWorkspace(true);
      return result;
    } catch (requestError) {
      setError(requestError.message);
      setErrorTab(activeTab);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="owner-workspace">
      {errorTab === activeTab && error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {loading && <p className="workspace-state">Loading your shop data...</p>}
      {!loading && !error && !data.dashboard && ["overview", "customer-store", "shop-profile"].includes(activeTab) && <p className="workspace-state">Your shop data is not available yet. Refresh to try again.</p>}

      <Suspense fallback={<p className="workspace-state" role="status">Loading this section…</p>}>
      {!loading && data.dashboard && activeTab === "customer-store" && (
  <CustomerStorePreview dashboard={data.dashboard} products={data.products} />
)}
{!loading && data.dashboard && activeTab === "overview" && (
        <Overview dashboard={data.dashboard} products={data.products} orders={data.orders} onNavigate={selectTab} />
      )}
      {!loading && activeTab === "products" && (
        <ProductsSection
          products={data.products}
          options={data.options}
          busy={busy}
          submit={submit}
          reload={() => loadWorkspace(true)}
          loading={loading}
          error={error}
        />
      )}
      {!loading && activeTab === "request-categories" && <CategoryRequestsPage requests={data.requests} options={data.options} busy={busy} submit={submit} reload={() => loadWorkspace(true)} loading={loading} />}
      {!loading && activeTab === "request-subcategories" && <SubcategoryRequestsPage requests={data.requests} options={data.options} busy={busy} submit={submit} reload={() => loadWorkspace(true)} loading={loading} />}
      {!loading && activeTab === "request-brands" && <BrandRequestsPage requests={data.requests} options={data.options} busy={busy} submit={submit} reload={() => loadWorkspace(true)} loading={loading} />}
      {!loading && activeTab === "request-attributes" && <VariantRequestsPage requests={data.requests} options={data.options} busy={busy} submit={submit} reload={() => loadWorkspace(true)} loading={loading} />}
      {!loading && activeTab === "manage-products" && (
        <section className="workspace-card">
          <h2>Manage Products</h2>
          <p>Product creation and catalog management are available directly to Shop Owners and do not require Admin approval.</p>
          <button className="btn btn-primary" type="button" onClick={() => selectTab("products")}>Go to Products &amp; Inventory</button>
        </section>
      )}
      {!loading && activeTab === "employee-access" && <OwnerEmployeeAccess />}
      {!loading && activeTab === "returns-management" && <OwnerReturnManagement />}
      {!loading && activeTab === "delivery-management" && <OwnerDeliveryAssignments />}
      {!loading && (
  activeTab === "employees" ||
  activeTab === "employee-salary" ||
  activeTab === "employee-payroll"
) && (
        <EmployeesSection
          employees={data.employees}
          section={{ employees: "employees", "employee-attendance": "attendance", "employee-salary": "salary", "employee-payroll": "payroll" }[activeTab]}
          busy={busy}
          submit={submit}
          error={error}
          reload={() => loadWorkspace(true)}
          loading={loading}
        />
        )}
        {!loading && activeTab === "employee-attendance" && (
  <AttendancePage employees={data.employees} />
)}

      {!loading && activeTab === "orders" && (
        <OrdersSection orders={data.orders} mode={activeTab === "delivery-management" ? "delivery" : "orders"} busy={busy} submit={submit} reload={() => loadWorkspace(true)} loading={loading} />
      )}
      {!loading && activeTab === "inventory" && (
        <InventoryPage products={data.products} />
      )}
      {!loading && !error && activeTab === "payments" && (
        <PaymentsPage payments={data.payments} onRefresh={() => loadWorkspace(true)} />
      )}
      {!loading && !error && activeTab === "reports" && data.reports && (
        <ReportsPage report={data.reports} onRefresh={() => loadWorkspace(true)} />
      )}
{!loading && activeTab === "purchase-orders" && <PurchaseOrdersSection />}
{!loading && activeTab === "coupons" && <CouponsPage />}
{!loading && activeTab === "wholesalers" && <OwnerWholesalers />}
      {!loading && activeTab === "profile" && (
        <OwnerProfile user={user} submit={submit} />
      )}
      {!loading && data.dashboard && activeTab === "shop-profile" && (
        <OwnerShopProfile shop={data.dashboard.shop} submit={submit} />
      )}
      {!loading && activeTab === "settings" && (
        <OwnerSettings />
      )}
      </Suspense>
    </section>
  );
}
