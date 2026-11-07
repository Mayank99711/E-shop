import { useEffect, useState } from "react";
import { shopOwnerApi } from "../../services/shopOwner/index.js";
import CouponUsageDetails from "./CouponUsageDetails.jsx";

const empty = () => ({ code: "", discountType: "PERCENTAGE", discountValue: "10", minimumOrder: "0", maxDiscount: "", usageLimit: "", perCustomerLimit: "1", startsAt: new Date().toISOString().slice(0, 16), expiresAt: "", isActive: true });
const money = v => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(v || 0));
export default function CouponsPage() {
  const [items, setItems] = useState([]);
  const [usageCoupon, setUsageCoupon] = useState(null);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() { try { const data = await shopOwnerApi.coupons(); setItems(data.items || []); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  const begin = (item = null) => {
    setEditId(item?.id || null);
    setForm(item ? {
      ...item, discountValue: String(item.discountValue), minimumOrder: String(item.minimumOrder),
      maxDiscount: item.maxDiscount ?? "", usageLimit: item.usageLimit ?? "", perCustomerLimit: item.perCustomerLimit ?? "",
      startsAt: new Date(item.startsAt).toISOString().slice(0, 16), expiresAt: new Date(item.expiresAt).toISOString().slice(0, 16)
    } : empty());
    setOpen(true); setError(""); setMessage("");
  };
  function payload() {
    return {
      ...form,
      code: form.code.trim().toUpperCase(),
      discountValue: Number(form.discountValue), minimumOrder: Number(form.minimumOrder || 0),
      maxDiscount: form.maxDiscount === "" || form.maxDiscount == null ? null : Number(form.maxDiscount),
      usageLimit: form.usageLimit === "" || form.usageLimit == null ? null : Number(form.usageLimit),
      perCustomerLimit: form.perCustomerLimit === "" || form.perCustomerLimit == null ? null : Number(form.perCustomerLimit),
      startsAt: new Date(form.startsAt).toISOString(), expiresAt: new Date(form.expiresAt).toISOString()
    };
  }
  async function save(e) {
    e.preventDefault(); setBusy(true); setError("");
    try { const body = payload(); if (editId) delete body.code; if (editId) await shopOwnerApi.updateCoupon(editId, body); else await shopOwnerApi.createCoupon(body); setOpen(false); setMessage(editId ? "Coupon updated." : "Coupon created."); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function toggle(item) {
    if (!window.confirm(`${item.isActive ? "Deactivate" : "Activate"} coupon ${item.code}?`)) return;
    setBusy(true); setError(""); try { await shopOwnerApi.updateCoupon(item.id, { isActive: !item.isActive }); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="container-fluid py-3">
    <div className="d-flex justify-content-between align-items-center mb-3"><div><h3>Coupon Management</h3><p className="text-muted">Create discounts for customers of your shop.</p></div><button className="btn btn-primary" onClick={() => begin()}>+ Create Coupon</button></div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}{message && <div className="alert alert-success">{message}</div>}
    <div className="table-responsive"><table className="table table-hover align-middle"><thead><tr><th>Code</th><th>Discount</th><th>Minimum Order</th><th>Validity</th><th>Uses</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map(c => <tr key={c.id}><td><strong>{c.code}</strong></td><td>{c.discountType === "PERCENTAGE" ? `${c.discountValue}%` : money(c.discountValue)}</td><td>{money(c.minimumOrder)}</td><td>{new Date(c.startsAt).toLocaleDateString()} – {new Date(c.expiresAt).toLocaleDateString()}</td><td>{c.usedCount}/{c.usageLimit ?? "Unlimited"}</td><td><button className={`btn btn-sm ${c.isActive ? "btn-outline-success" : "btn-outline-secondary"}`} disabled={busy} onClick={() => toggle(c)}>{c.isActive ? "ACTIVE" : "INACTIVE"}</button></td><td><div className="d-flex flex-wrap gap-2"><button className="btn btn-sm btn-outline-primary" onClick={() => begin(c)}>Edit</button><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setUsageCoupon(c)}>Usage Details</button></div></td></tr>)}{items.length === 0 && <tr><td colSpan={7}>No coupons created yet.</td></tr>}</tbody></table></div>
    {usageCoupon && <CouponUsageDetails coupon={usageCoupon} onClose={() => setUsageCoupon(null)} />}
    {open && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1100, display: "grid", placeItems: "center", padding: 12 }}><div className="card shadow-lg" role="dialog" aria-modal="true" style={{ maxWidth: 780, width: "100%", maxHeight: "92vh", overflow: "auto" }}><div className="card-body"><h4>{editId ? "Edit Coupon" : "Create Coupon"}</h4><form className="row g-3" onSubmit={save}>
      <div className="col-md-6"><label className="form-label">Coupon Code *</label><input className="form-control" required maxLength={30} pattern="[A-Za-z0-9_-]{3,30}" disabled={!!editId} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}/></div>
      <div className="col-md-6"><label className="form-label">Discount Type</label><select className="form-select" value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed Amount</option></select></div>
      {[ ["discountValue", "Discount Value *", 0.01], ["minimumOrder", "Minimum Order Amount", 0], ["maxDiscount", "Maximum Discount (optional)", 0], ["usageLimit", "Total Usage Limit (optional)", 1], ["perCustomerLimit", "Per Customer Limit (optional)", 1] ].map(([key, label, min]) => <div className="col-md-6" key={key}><label className="form-label">{label}</label><input type="number" className="form-control" min={min} step={key.endsWith("Limit") ? 1 : 0.01} required={key === "discountValue"} value={form[key] ?? ""} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}/></div>)}
      {[ ["startsAt", "Start Date & Time"], ["expiresAt", "Expiry Date & Time"] ].map(([key, label]) => <div className="col-md-6" key={key}><label className="form-label">{label} *</label><input className="form-control" type="datetime-local" required value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}/></div>)}
      <div className="col-12"><label><input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}/> Active</label></div>
      <div className="col-12 d-flex justify-content-between"><button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)}>Cancel</button><button disabled={busy} className="btn btn-primary">{busy ? "Saving..." : "Save Coupon"}</button></div>
    </form></div></div></div>}
  </div>;
}
