import { useEffect, useState } from "react";
import { shopOwnerApi } from "../../../services/shopOwner/index.js";

const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value ?? 0));
const stamp = value => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
const offerLabel = row => row.couponDiscountType === "PERCENTAGE"
  ? `${Number(row.couponDiscountValue)}% OFF`
  : `${money(row.couponDiscountValue)} OFF`;

export default function CouponUsageDetails({ coupon, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    shopOwnerApi.couponUsage(coupon.id)
      .then(data => { if (current) setRows(data.items || []); })
      .catch(err => { if (current) setError(err.message || "Could not load coupon usage details."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [coupon.id]);

  return (
    <div className="coupon-usage-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="coupon-usage-panel" role="dialog" aria-modal="true" aria-labelledby="coupon-usage-heading">
        <header className="coupon-usage-head">
          <div>
            <h3 id="coupon-usage-heading">Usage Details — {coupon.code}</h3>
            <p>Who used this coupon, what offer it provided, and the actual discount on the order.</p>
          </div>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
        </header>
        <div className="coupon-usage-stats">
          <span><strong>{coupon.usedCount ?? 0}</strong> reserved uses</span>
          <span><strong>{coupon.usageLimit ?? "Unlimited"}</strong> total usage limit</span>
          <span><strong>{rows.length}</strong> recent usage records</span>
        </div>
        {loading && <p role="status">Loading coupon usage...</p>}
        {error && <div role="alert" className="alert alert-danger">{error}</div>}
        {!loading && !error && (
          <div className="table-responsive">
            <table className="table table-hover align-middle coupon-usage-table">
              <thead><tr>
                <th>Customer</th><th>Order No.</th><th>Coupon Code</th><th>Coupon Offer</th>
                <th>Discount Applied</th><th>Order Subtotal</th><th>Delivery Charge</th>
                <th>Final Payable</th><th>Used On</th><th>Order Status</th>
              </tr></thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td><strong>{row.customerName || "Customer"}</strong><small>{row.customerEmail || ""}</small></td>
                    <td>{row.orderNumber}</td>
                    <td><span className="coupon-usage-code">{row.couponCode}</span></td>
                    <td>{offerLabel(row)}</td>
                    <td className="coupon-usage-saving">−{money(row.discountTotal)}</td>
                    <td>{money(row.orderSubtotal)}</td>
                    <td>{money(row.deliveryTotal)}</td>
                    <td><strong>{money(row.grandTotal)}</strong></td>
                    <td>{stamp(row.createdAt)}</td>
                    <td>{row.orderStatus}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={10} className="text-center py-4">This coupon has no recorded usage yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="coupon-usage-note">
          <strong>About these amounts:</strong> Coupon Offer shows the current configured coupon value (percentage or fixed),
          whereas Discount Applied shows the exact amount saved on that order. Order Subtotal excludes the coupon discount;
          Final Payable is the order's saved total including applicable shipping and tax treatment.
          A redemption can be reserved on COD order creation or Razorpay payment initiation, so it does not necessarily mean payment was received.
        </p>
      </section>
    </div>
  );
}
