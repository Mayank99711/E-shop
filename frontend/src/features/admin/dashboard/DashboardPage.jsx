import { useTheme } from "../../../context/ThemeContext.jsx";

export function ReportsOverview({ data, onNavigate }) {
  const recent = data.recent || { shops: [], requests: [], orders: [] };
  return <div className="reports-grid">
    <section className="workspace-card"><div className="workspace-card-heading"><div><h3>Recent shops</h3><p>Latest shop and owner invitations.</p></div><button className="btn btn-sm btn-outline-primary" type="button" onClick={() => onNavigate("shops")}>Manage shops</button></div>
      {recent.shops.length ? <div className="record-list">{recent.shops.map((shop) => <article className="record-row" key={shop.id}><div><strong>{shop.name}</strong><small>{shop.owner.name} · {shop.owner.email} · {new Date(shop.createdAt).toLocaleDateString()}</small></div><span className={`status-pill ${shop.status.toLowerCase()}`}>{shop.status}</span></article>)}</div> : <div className="empty-state">No shops to report.</div>}
    </section>
    <section className="workspace-card"><div className="workspace-card-heading"><div><h3>Recent data requests</h3><p>Owner-submitted global catalog changes.</p></div><button className="btn btn-sm btn-outline-primary" type="button" onClick={() => onNavigate("requests")}>Review requests</button></div>
      {recent.requests.length ? <div className="record-list">{recent.requests.map((request) => <article className="record-row" key={request.id}><div><strong>{request.type.replaceAll("_", " ")} · {request.shop.name}</strong><small>{request.requester.name} · {new Date(request.createdAt).toLocaleDateString()}</small></div><span className={`status-pill ${request.status.toLowerCase()}`}>{request.status}</span></article>)}</div> : <div className="empty-state">No catalog requests to report.</div>}
    </section>
    <section className="workspace-card"><h3>Recent orders</h3>
      {recent.orders.length ? <div className="record-list">{recent.orders.map((order) => <article className="record-row" key={order.id}><div><strong>{order.orderNumber}</strong><small>{order.customer.name} · {new Date(order.createdAt).toLocaleDateString()}</small></div><span>{order.status}</span></article>)}</div> : <div className="empty-state">No orders to report.</div>}
    </section>
  </div>;
}


export function AdminSettings() {
  const { theme, toggleTheme } = useTheme();
  return <section className="workspace-card">
    <h3>Appearance</h3>
    <p>Theme preference is stored locally for this browser.</p>
    <button className="btn btn-outline-primary" type="button" onClick={toggleTheme}>Switch to {theme === "dark" ? "light" : "dark"} theme</button>
    <hr />
    <h3>Account security</h3>
    <p>Administrator access uses the server-managed session cookie. Password changes are available under My Profile.</p>
  </section>;
}


export function SummaryCards({ metrics }) {
  const items = [
    ["Shops", metrics.shops],
    ["Shop owners", metrics.owners],
    ["Employees", metrics.employees],
    ["Customers", metrics.customers],
    ["Active products", metrics.activeProducts],
    ["Requests to review", metrics.pendingRequests],
    ["Orders", metrics.orders],
    ["Paid revenue", `₹${Number(metrics.paidRevenue).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]
  ];
  return <div className="metric-grid">{items.map(([label, value]) => <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>;
}
