import { DemoPhoto, demoProductPhoto } from "../../../components/customer/DemoMedia.jsx";
import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../../services/admin/index.js";
import { resolveMediaUrl } from "../../../services/apiClient.js";
import { money } from "../../../utils/format.js";

const pageConfig = {
  employees: {
    title: "Manage Employees",
    description: "Employee records across shops. Personal contact and payroll details are not shown here.",
    search: (item) => [item.employeeCode, item.name, item.shop.name, item.designation],
  },
  commission: {
    title: "Shop Commissions",
    description: "Review and update the commission percentage assigned to each shop.",
    search: (item) => [item.name, item.code, item.owner?.name, item.status],
  },
  orders: {
    title: "Platform Orders",
    description: "Recent customer orders and their shop fulfilment and payment states.",
    search: (item) => [item.orderNumber, item.status, ...item.shopOrders.map(({ shop }) => shop.name)],
  },
  products: {
    title: "Manage Products",
    description: "Review platform-wide products and change listing status. Product content and pricing remain with the shop owner.",
    search: (item) => [item.name, item.shop.name, item.category.name, item.status],
  },
  "audit-logs": {
    title: "Audit Logs",
    description: "Recent administrative and operational actions. Sensitive metadata is intentionally excluded.",
    search: (item) => [item.action, item.targetType, item.targetId, item.actor.name],
  },
};

function Status({ value }) {
  return <span className={`status-pill ${String(value).toLowerCase()}`}>{String(value).replaceAll("_", " ")}</span>;
}

function EmptyRows({ colSpan, children }) {
  return <tr><td className="operations-empty" colSpan={colSpan}>{children}</td></tr>;
}

export default function AdminOperationsPage({ type, items, onReload, loading }) {
  const config = pageConfig[type];
  const [query, setQuery] = useState("");
  const [commissionDrafts, setCommissionDrafts] = useState({});
  const [productDrafts, setProductDrafts] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setCommissionDrafts({});
    setProductDrafts({});
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? items.filter((item) => config.search(item).some((value) => String(value ?? "").toLocaleLowerCase().includes(term))) : items;
  }, [config, items, query]);

  async function saveCommission(shop) {
    const value = commissionDrafts[shop.id] ?? (shop.commissionPercentage ?? "");
    const commissionPercentage = value === "" ? null : Number(value);
    if (commissionPercentage !== null && (!Number.isFinite(commissionPercentage) || commissionPercentage < 0 || commissionPercentage > 100 || Math.round(commissionPercentage * 100) !== commissionPercentage * 100)) {
      setError("Enter a commission from 0 to 100 with at most two decimal places.");
      return;
    }
    setBusyId(shop.id);
    setError("");
    setNotice("");
    try {
      await adminApi.updateShop(shop.id, { name: shop.name, commissionPercentage });
      setNotice(`Commission updated for ${shop.name}.`);
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }

  async function saveProductStatus(product) {
    const status = productDrafts[product.id] ?? product.status;
    setBusyId(product.id);
    setError("");
    setNotice("");
    try {
      await adminApi.setProductStatus(product.id, status);
      setNotice(`Product status updated for ${product.name}.`);
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }

  return <section className="workspace-card operations-card">
    <div className="workspace-card-heading">
      <div><h3>{config.title}</h3><p>{config.description}</p></div>
      <button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={onReload}>{"\u21BB"}</button>
    </div>
    {error && <div className="workspace-notice error" role="alert">{error}</div>}
    {notice && <div className="workspace-notice success" role="status">{notice}</div>}
    <div className="operations-toolbar">
      <label className="visually-hidden" htmlFor={`admin-${type}-search`}>Search {config.title.toLowerCase()}</label>
      <input id={`admin-${type}-search`} className="form-control" type="search" placeholder={`Search ${config.title.toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)} />
      <span className="record-count">{filteredItems.length} shown · up to 100 records</span>
    </div>
    <div className="table-responsive">
      {type === "employees" && <table className="table align-middle workspace-table" aria-label="Employees across shops"><thead><tr><th>Employee</th><th>Shop</th><th>Role</th><th>Status</th></tr></thead><tbody>
        {filteredItems.length ? filteredItems.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.employeeCode}</small></td><td>{item.shop.name}</td><td>{item.designation}</td><td><Status value={item.isActive ? "ACTIVE" : "INACTIVE"} /></td></tr>) : <EmptyRows colSpan={4}>No employee records match this search.</EmptyRows>}
      </tbody></table>}
      {type === "commission" && <table className="table align-middle workspace-table" aria-label="Shop commission rates"><thead><tr><th>Shop</th><th>Owner</th><th>Rate (%)</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {filteredItems.length ? filteredItems.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.code}</small></td><td>{item.owner?.name || "—"}</td><td><input className="form-control commission-input" type="number" min="0" max="100" step="0.01" aria-label={`Commission percentage for ${item.name}`} value={commissionDrafts[item.id] ?? item.commissionPercentage ?? ""} placeholder="Not set" onChange={(event) => setCommissionDrafts((drafts) => ({ ...drafts, [item.id]: event.target.value }))} /></td><td><Status value={item.status} /></td><td><button className="btn btn-sm btn-primary" type="button" disabled={busyId === item.id} onClick={() => saveCommission(item)}>{busyId === item.id ? "Saving…" : "Save rate"}</button></td></tr>) : <EmptyRows colSpan={5}>No shops match this search.</EmptyRows>}
      </tbody></table>}
      {type === "orders" && <table className="table align-middle workspace-table" aria-label="Platform orders"><thead><tr><th>Order</th><th>Created</th><th>Shops</th><th>Total</th><th>Order / payment</th></tr></thead><tbody>
        {filteredItems.length ? filteredItems.map((item) => {
          const payment = item.payments[0];
          return <tr key={item.id}><td><strong>{item.orderNumber}</strong></td><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.shopOrders.map(({ shop }) => shop.name).join(", ") || "—"}</td><td>{money(item.grandTotal)}</td><td><Status value={item.status} /> <small>{payment ? `${payment.provider} · ${payment.status}` : "No payment record"}</small></td></tr>;
        }) : <EmptyRows colSpan={5}>No orders match this search.</EmptyRows>}
      </tbody></table>}
      {type === "products" && <table className="table align-middle workspace-table" aria-label="Platform products"><thead><tr><th>Product</th><th>Shop</th><th>Category</th><th>Stock</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {filteredItems.length ? filteredItems.map((item) => <tr key={item.id}><td><div className="operations-product"><DemoPhoto src={item.images?.[0]?.url} fallback={demoProductPhoto(item)} alt={item.name} /><div><strong>{item.name}</strong><small>Updated {new Date(item.updatedAt).toLocaleDateString()}</small></div></div></td><td>{item.shop.name}</td><td>{item.category.name}</td><td>{item.variants.reduce((total, variant) => total + (variant.isActive ? variant.stock : 0), 0)}</td><td><Status value={item.status} /></td><td><div className="product-status-action"><select className="form-select form-select-sm" aria-label={`Set listing status for ${item.name}`} value={productDrafts[item.id] ?? item.status} onChange={(event) => setProductDrafts((drafts) => ({ ...drafts, [item.id]: event.target.value }))}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select><button className="btn btn-sm btn-outline-primary" type="button" disabled={busyId === item.id || (productDrafts[item.id] ?? item.status) === item.status} onClick={() => saveProductStatus(item)}>{busyId === item.id ? "Saving…" : "Save"}</button></div></td></tr>) : <EmptyRows colSpan={6}>No products match this search.</EmptyRows>}
      </tbody></table>}
      {type === "audit-logs" && <table className="table align-middle workspace-table" aria-label="Recent audit log entries"><thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Target</th></tr></thead><tbody>
        {filteredItems.length ? filteredItems.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td><strong>{item.action.replaceAll("_", " ")}</strong></td><td>{item.actor.name}</td><td>{item.targetType}<small>{item.targetId}</small></td></tr>) : <EmptyRows colSpan={4}>No audit entries match this search.</EmptyRows>}
      </tbody></table>}
    </div>
  </section>;
}
