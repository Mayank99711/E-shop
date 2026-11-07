import { Link } from 'react-router-dom';

export function Overview({ dashboard, products, orders, onNavigate }) {
  const metrics = [
    ["Products", dashboard.metrics.products, "products"],
    ["Active listings", dashboard.metrics.activeProducts, "products"],
    ["Units in stock", dashboard.metrics.inventoryUnits, "products"],
    [`Low stock (≤ ${dashboard.metrics.lowStockThreshold})`, dashboard.metrics.lowStockVariants, "products"],
    ["Active employees", dashboard.metrics.employees, "employees"],
    ["Open orders", dashboard.metrics.openOrders, "orders"],
    ["Fulfilled sales", `₹${Number(dashboard.metrics.fulfilledSales).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "orders"]
  ];
  return (
    <>
      <div className="metric-grid">
        {metrics.map(([label, value, tab]) => (
          <button className="metric-card" key={label} type="button" onClick={() => onNavigate(tab)}>
            <span>{label}</span><strong>{value}</strong>
          </button>
        ))}
      </div>
      <div className="workspace-columns">
        <section className="workspace-card">
          <div className="section-heading"><h2>Recently updated products</h2><button className="btn btn-sm btn-outline-primary" onClick={() => onNavigate("products")}>Manage products</button></div>
          {products.length === 0
            ? <p className="muted-copy">Your catalog is empty. Add your first product from Products &amp; inventory.</p>
            : <ul className="compact-list">{products.slice(0, 5).map((product) => <li key={product.id}><span>{product.name}</span><span className={`status-pill ${product.status.toLowerCase()}`}>{product.status}</span></li>)}</ul>}
        </section>
        <section className="workspace-card">
          <div className="section-heading"><h2>Latest orders</h2><button className="btn btn-sm btn-outline-primary" onClick={() => onNavigate("orders")}>View orders</button></div>
          {orders.length === 0
            ? <p className="muted-copy">Orders placed with your shop will appear here.</p>
            : <ul className="compact-list">{orders.slice(0, 5).map((order) => <li key={order.id}><span>{order.order.orderNumber}</span><span className={`status-pill ${order.status.toLowerCase()}`}>{order.status.replaceAll("_", " ")}</span></li>)}</ul>}
        </section>
      </div>
    </>
  );
}
