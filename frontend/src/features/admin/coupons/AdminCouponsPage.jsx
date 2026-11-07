import { useEffect, useState } from "react";
import { adminApi } from "../../../services/admin/index.js";
export default function AdminCouponsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { adminApi.coupons().then(result => setItems(result.items || [])).catch(e => setError(e.message)); }, []);
  return <div className="container-fluid py-3"><h3>Shop Coupons</h3><p className="text-muted">Read-only overview of coupon rules and usage across shops.</p>{error && <div className="alert alert-danger">{error}</div>}<div className="table-responsive"><table className="table table-hover align-middle"><thead><tr><th>Shop</th><th>Code</th><th>Discount</th><th>Minimum</th><th>Usage</th><th>Expires</th><th>Status</th></tr></thead><tbody>{items.map(c => <tr key={c.id}><td>{c.shop?.name || c.shopId}</td><td>{c.code}</td><td>{c.discountType === "PERCENTAGE" ? `${c.discountValue}%` : `₹${c.discountValue}`}</td><td>₹{c.minimumOrder}</td><td>{c.usedCount}/{c.usageLimit ?? "Unlimited"}</td><td>{new Date(c.expiresAt).toLocaleString()}</td><td>{c.isActive ? "ACTIVE" : "INACTIVE"}</td></tr>)}{items.length === 0 && <tr><td colSpan={7}>No coupons found.</td></tr>}</tbody></table></div></div>;
}
