import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getAdminResource } from "../../services/admin/index.js";
const AdminCouponsPage = lazy(() => import('../../features/admin/coupons/AdminCouponsPage.jsx'));
const SummaryCards = lazy(() => import('../../features/admin/dashboard/DashboardPage.jsx').then((module) => ({ default: module.SummaryCards })));
const ReportsOverview = lazy(() => import('../../features/admin/dashboard/DashboardPage.jsx').then((module) => ({ default: module.ReportsOverview })));
const AdminSettings = lazy(() => import('../../features/admin/dashboard/DashboardPage.jsx').then((module) => ({ default: module.AdminSettings })));
const ShopManagement = lazy(() => import('../../features/admin/shops/ShopsPage.jsx').then((module) => ({ default: module.ShopManagement })));
const CategoryManagement = lazy(() => import('../../features/admin/categories/CategoriesPage.jsx').then((module) => ({ default: module.CategoryManagement })));
const ShopCategoryManagement = lazy(() => import('../../features/admin/shop-categories/ShopCategoriesPage.jsx').then((module) => ({ default: module.ShopCategoryManagement })));
const BrandManagement = lazy(() => import('../../features/admin/brands/BrandsPage.jsx').then((module) => ({ default: module.BrandManagement })));
const VariantManagement = lazy(() => import('../../features/admin/variants/VariantsPage.jsx').then((module) => ({ default: module.VariantManagement })));
const RequestReview = lazy(() => import('../../features/admin/data-requests/DataRequestsPage.jsx').then((module) => ({ default: module.RequestReview })));
const ProfileManagement = lazy(() => import('../../features/admin/profile/ProfilePage.jsx').then((module) => ({ default: module.ProfileManagement })));
const AccountDeletionReview = lazy(() => import('../../features/admin/account-requests/AccountRequestsPage.jsx').then((module) => ({ default: module.AccountDeletionReview })));
const WholesalerManagement = lazy(() => import('../../features/admin/wholesalers/WholesalersPage.jsx').then((module) => ({ default: module.WholesalerManagement })));
const AdminOperationsPage = lazy(() => import('../../features/admin/operations/AdminOperationsPage.jsx'));

const views = [
  ["dashboard", "Overview"],
  ["shops", "Shops & owners"],
  ["employees", "Manage Employees"],
  ["commission", "Commission"],
  ["orders", "Orders"],
  ["categories", "Categories"],
  ["subcategories", "Manage Subcategories"],
  ["brands", "Brands"],
  ["products", "Manage Products"],
  ["coupons", "Coupons"],
  ["wholesalers", "Wholesalers"],
  ["variants", "Variants"],
  ["requests", "Data requests"],
  ["account-deletions", "Account requests"],
  ["audit-logs", "Audit Logs"],
  ["profile", "My profile"],
  ["reports", "Reports & analytics"],
  ["settings", "Settings"]
];

function PageHeading({ eyebrow, title, description }) {
  return <div className="workspace-heading"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>;
}

export default function AdminWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [dataView, setDataView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((value) => value + 1);
  const pathToView = {
    "/admin/dashboard": "dashboard",
    "/admin/shop-categories": "shop-categories",
    "/admin/shops": "shops",
    "/admin/employees": "employees",
    "/admin/commission": "commission",
    "/admin/orders": "orders",
    "/admin/categories": "categories",
    "/admin/subcategories": "subcategories",
    "/admin/brands": "brands",
    "/admin/products": "products",
    "/admin/shop-wholesaler-access": "wholesalers",
    "/admin/coupons": "coupons",
    "/admin/wholesalers": "wholesalers",
    "/admin/variants": "variants",
    "/admin/data-requests": "requests",
    "/admin/account-requests": "account-deletions",
    "/admin/audit-logs": "audit-logs",
    "/admin/profile": "profile",
    "/admin/reports": "reports",
    "/admin/settings": "settings"
  };
  const pathForView = {
    dashboard: "/admin/dashboard",
    "shop-categories": "/admin/shop-categories",
    shops: "/admin/shops",
    employees: "/admin/employees",
    commission: "/admin/commission",
    orders: "/admin/orders",
    categories: "/admin/categories",
    subcategories: "/admin/subcategories",
    brands: "/admin/brands",
    products: "/admin/products",
    "shop-wholesaler-access": "/admin/wholesalers",
    coupons: "/admin/coupons",
    wholesalers: "/admin/wholesalers",
    variants: "/admin/variants",
    requests: "/admin/data-requests",
    "account-deletions": "/admin/account-requests",
    "audit-logs": "/admin/audit-logs",
    profile: "/admin/profile",
    reports: "/admin/reports",
    settings: "/admin/settings"
  };
  const view = pathToView[location.pathname] || "dashboard";

function selectView(nextView) {
  const targetPath = pathForView[nextView];

  if (!targetPath || location.pathname === targetPath) {
    return;
  }

  navigate(targetPath);
}
  const heading = {
    dashboard: ["PLATFORM OVERVIEW", "Good morning.", "Live platform metrics from the shared E-Shop database."],
    "shop-categories": ["SHOP CATEGORIES", "Shop Categories", "Categories used to classify shops."],
    shops: ["SHOP MANAGEMENT", "Shops & owners", "Create shop records, send secure invitations, and manage shop status."],
    categories: ["GLOBAL CATALOG", "Categories", "Organize global categories into an arbitrary parent-child hierarchy."],
    subcategories: ["GLOBAL CATALOG", "Subcategories", "Manage children under active parent categories."],
    brands: ["GLOBAL CATALOG", "Brands", "Maintain the shared brand directory used by all eligible shops."],
    "shop-wholesaler-access": ["WHOLESALER MANAGEMENT", "Shop–Wholesaler Access", "Manage which wholesalers are authorized for each shop."],
    wholesalers: ["WHOLESALER MANAGEMENT", "Wholesalers", "Manage wholesalers and shop authorization."],
    variants: ["GLOBAL CATALOG", "Variant definitions", "Manage global product attributes and their allowed values."],
    requests: ["APPROVALS", "Master-data requests", "Review owner requests and record the reason for every rejection."],
    "account-deletions": ["CUSTOMER PRIVACY", "Account requests", "Record customer account-deletion request review without erasing data automatically."],
    profile: ["ACCOUNT", "My profile", "Manage your administrator identity and password."],
    reports: ["PLATFORM ANALYTICS", "Reports & Analytics", "Live platform totals and recent operational records."],
    settings: ["PREFERENCES", "Settings", "Manage session-safe interface preferences."]
  }[view];
  //for degguging
//   useEffect(() => {
//   console.log("[WORKSPACE-DEBUG]", {
//     pathname: location.pathname,
//     view,
//     dataView,
//     loading,
//     reloadKey,
//   });
// }, [location.pathname, view, dataView, loading, reloadKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getAdminResource(view)
      .then((result) => {
        if (active) {
          setData(result);
          setDataView(view);
        }
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [view, reloadKey]);

  //for degbugging
//   console.log("[WORKSPACE-DEBUG] render", {
//   view,
//   dataView,
//   isViewMismatch: dataView !== view,
//   loading,
// });

  return (
    <section className="admin-workspace">
      <nav className="workspace-nav" aria-label="Super Admin sections">
        {views.map(([key, label]) => <button key={key} className={view === key ? "selected" : ""} aria-current={view === key ? "page" : undefined} onClick={() => selectView(key)}>{label}</button>)}
      </nav>
      {["dashboard", "reports", "profile", "settings"].includes(view) && <PageHeading eyebrow={heading[0]} title={heading[1]} description={heading[2]} />}
      {error && <div className="workspace-notice error" role="alert">{error}</div>}
      {dataView !== view ? (loading ? <div className="workspace-card loading-state" role="status">Loading live platform data...</div> : null) : (
        <Suspense fallback={<div className="workspace-card loading-state" role="status">Loading this section…</div>}>
          {loading && <div className="workspace-card loading-state" role="status">Refreshing live platform data...</div>}
          {view === "dashboard" && data?.metrics && <SummaryCards metrics={data.metrics} />}
          {view === "shops" && <ShopManagement items={data?.items || []} onReload={reload} loading={loading} />}
          {["employees", "commission", "orders", "products", "audit-logs"].includes(view) && <AdminOperationsPage type={view} items={data?.items || []} onReload={reload} loading={loading} />}
          {view === "shop-categories" && <ShopCategoryManagement items={data?.items || []} onReload={reload} loading={loading} />}
          {view === "categories" && <CategoryManagement key="categories" items={data?.items || []} onReload={reload} loading={loading} />}
          {view === "subcategories" && <CategoryManagement items={data?.items || []} onReload={reload} subcategoriesOnly loading={loading} />}
          {view === "brands" && <BrandManagement items={data?.items || []} onReload={reload} loading={loading} />}
{view === "wholesalers" && <WholesalerManagement />}

          {view === "coupons" && <AdminCouponsPage />}
          {view === "variants" && <VariantManagement items={data?.items || []} onReload={reload} loading={loading} />}
          {view === "requests" && <RequestReview items={data?.items || []} onReload={reload} loading={loading} />}
          {view === "account-deletions" && <AccountDeletionReview items={data?.items || []} onReload={reload} loading={loading} />}
          {view === "profile" && data?.user && <ProfileManagement user={data.user} />}
          {view === "reports" && data?.metrics && <ReportsOverview data={data} onNavigate={selectView} />}
          {view === "settings" && <AdminSettings />}
        </Suspense>
      )}
    </section>
  );
}
