const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default function ReportsPage({ report, onRefresh }) {
  const metrics = [
    ["Orders", report.orderCount],
    ["Verified paid payments", currency.format(Number(report.paidPaymentTotal) || 0)],
    ["Active products", `${report.products.active} / ${report.products.total}`],
    ["Units in stock", report.products.inventoryUnits],
    ["Available variants", report.products.availableVariants],
    [`Low-stock variants (≤ ${report.products.lowStockThreshold})`, report.products.lowStockVariants],
    ["Active employees", report.activeEmployees],
  ];

  return (
    <div>
      <div className="d-flex justify-content-end mb-3">
        <button className="btn btn-sm btn-outline-secondary" type="button" onClick={onRefresh}>Refresh report</button>
      </div>
      <div className="metric-grid">
        {metrics.map(([label, value]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="workspace-columns">
        <section className="workspace-card">
          <h2>Order status summary</h2>
          {report.orderStatuses.length ? (
            <ul className="compact-list">
              {report.orderStatuses.map(({ status, count }) => (
                <li key={status}>
                  <span className={`status-pill ${status.toLowerCase()}`}>{status.replaceAll("_", " ")}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          ) : <p className="muted-copy">No shop orders are available.</p>}
        </section>
        <section className="workspace-card">
          <h2>Customer payment status</h2>
          {report.paymentStatuses.length ? (
            <ul className="compact-list">
              {report.paymentStatuses.map(({ status, count }) => (
                <li key={status}>
                  <span className={`status-pill ${status.toLowerCase()}`}>{status.replaceAll("_", " ")}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          ) : <p className="muted-copy">No customer payment records are available.</p>}
        </section>
      </div>
      <p className="muted-copy">Reports use current shop-scoped order, payment, product, inventory, and employee records. The payment total includes only payments verified as PAID.</p>
    </div>
  );
}
