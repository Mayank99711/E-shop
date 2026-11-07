import { useMemo, useState } from "react";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function PaymentsPage({ payments, onRefresh }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const filteredPayments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return payments.filter((payment) => {
      const matchesSearch =
        !normalizedQuery ||
        [payment.order?.orderNumber, payment.providerPaymentId, payment.provider]
          .some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
      return matchesSearch &&
        (!provider || payment.provider === provider) &&
        (!status || payment.status === status);
    });
  }, [payments, provider, query, status]);

  return (
    <section className="workspace-card">
      <div className="section-heading">
        <div>
          <h2>Customer Payments</h2>
          <p className="muted-copy">Read-only payment records for orders placed with your shop.</p>
        </div>
        <button className="btn btn-sm btn-outline-secondary" type="button" onClick={onRefresh}>Refresh</button>
      </div>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <label className="visually-hidden" htmlFor="owner-payment-search">Search payments</label>
        <input
          id="owner-payment-search"
          className="form-control"
          type="search"
          placeholder="Search order or transaction reference"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ maxWidth: 340 }}
        />
        <label className="visually-hidden" htmlFor="owner-payment-provider">Filter by provider</label>
        <select id="owner-payment-provider" className="form-select" value={provider} onChange={(event) => setProvider(event.target.value)} style={{ maxWidth: 180 }}>
          <option value="">All providers</option>
          <option value="COD">COD</option>
          <option value="RAZORPAY">Razorpay</option>
        </select>
        <label className="visually-hidden" htmlFor="owner-payment-status">Filter by status</label>
        <select id="owner-payment-status" className="form-select" value={status} onChange={(event) => setStatus(event.target.value)} style={{ maxWidth: 180 }}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="AUTHORIZED">Authorized</option>
          <option value="PAID">Paid</option>
          <option value="FAILED">Failed</option>
          <option value="REFUND_PENDING">Refund pending</option>
          <option value="REFUNDED">Refunded</option>
        </select>
      </div>
      {filteredPayments.length === 0 ? (
        <p className="muted-copy">{payments.length ? "No payments match these filters." : "No customer payment records are available for this shop."}</p>
      ) : (
        <div className="employee-table-wrap">
          <table className="employee-table" aria-label="Customer payments">
            <thead>
              <tr>
                <th scope="col">Order reference</th>
                <th scope="col">Provider</th>
                <th scope="col">Payment status</th>
                <th scope="col">Amount</th>
                <th scope="col">Transaction reference</th>
                <th scope="col">Payment date</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.order?.orderNumber || payment.order?.id || "—"}</td>
                  <td>{payment.provider === "RAZORPAY" ? "Razorpay" : payment.provider}</td>
                  <td><span className={`status-pill ${payment.status.toLowerCase()}`}>{payment.status.replaceAll("_", " ")}</span></td>
                  <td>{currency.format(Number(payment.amount) || 0)}</td>
                  <td>{payment.providerPaymentId || "—"}</td>
                  <td>{dateTime.format(new Date(payment.verifiedAt || payment.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
