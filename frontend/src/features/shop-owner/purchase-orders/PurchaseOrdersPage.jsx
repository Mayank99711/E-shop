import { useState, useEffect } from "react";
import { shopOwnerApi } from "../../../services/shopOwner/index.js";
import { PurchaseOrderList } from "../../../components/shopOwner/PurchaseOrderList.jsx";
import { PurchaseOrderDetails } from "../../../components/shopOwner/PurchaseOrderDetails.jsx";

const emptyForm = () => ({
  wholesalerId: "",
  items: [{ productVariantId: "", quantity: 1, unitPrice: "" }],
});

export function PurchaseOrdersSection({ wholesalerId = null }) {
  const [orders, setOrders] = useState([]);
  const [wholesalers, setWholesalers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedPo, setSelectedPo] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(() => ({ ...emptyForm(), wholesalerId: wholesalerId || "" }));

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [poResult, whResult, prodResult] = await Promise.all([
        shopOwnerApi.purchaseOrders(),
        shopOwnerApi.wholesalers(),
        shopOwnerApi.products(),
      ]);
      setOrders(poResult.items || poResult || []);
      setWholesalers(whResult.items || whResult || []);
      setProducts(prodResult.items || prodResult || []);
    } catch (e) {
      setError(e.message || "Unable to load purchase orders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateLine(index, field, value) {
    setForm((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  }

  function addLine() {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { productVariantId: "", quantity: 1, unitPrice: "" }],
    }));
  }

  function removeLine(index) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }

  async function createPo(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = {
        wholesalerId: form.wholesalerId,
        items: form.items.map((line) => ({
          productVariantId: line.productVariantId,
          quantity: Number(line.quantity),
          ...(line.unitPrice ? { unitPrice: line.unitPrice } : {}),
        })),
      };
      await shopOwnerApi.createPurchaseOrder(body);
      setShowCreate(false);
      setForm(emptyForm());
      await load();
      setNotice("Purchase order created.");
    } catch (e) {
      setError(e.message || "Unable to create purchase order.");
    } finally {
      setBusy(false);
    }
  }

  async function viewPo(po) {
    try {
      const result = await shopOwnerApi.purchaseOrder(po.id);
      setSelectedPo(result.purchaseOrder || result);
    } catch (e) {
      setError(e.message || "Unable to load purchase order.");
    }
  }

  const visibleOrders = wholesalerId ? orders.filter(po => po.wholesalerId === wholesalerId) : orders;
  const visibleWholesalers = wholesalerId ? wholesalers.filter(w => w.id === wholesalerId) : wholesalers;
  const variants = products.flatMap((p) =>
    (p.variants || []).map((v) => ({ ...v, productName: p.name }))
  );

  const previewTotal = form.items.reduce((sum, line) => {
    const price = Number(line.unitPrice || 0);
    const qty = Number(line.quantity || 0);
    return sum + (Number.isFinite(price) && Number.isFinite(qty) ? price * qty : 0);
  }, 0);

  if (loading && orders.length === 0) {
    return <p className="workspace-state">Loading purchase orders...</p>;
  }

  return (
    <div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      <div className="workspace-card">
        <div className="workspace-card-heading">
          <div>
            <h3>Purchase Orders</h3>
            <p>Create and track wholesaler purchase orders.</p>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => { setForm({ ...emptyForm(), wholesalerId: wholesalerId || "" }); setShowCreate(true); }}
          >
            + Add Purchase Order
          </button>
        </div>
        <PurchaseOrderList orders={visibleOrders} onView={viewPo} />
      </div>

      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", zIndex: 1055, padding: 16 }}>
          <div className="workspace-card" role="dialog" aria-modal="true" aria-labelledby="create-po-title" style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflow: "auto" }}>
            <h3 id="create-po-title">Add Purchase Order</h3>
            <form className="workspace-form" onSubmit={createPo}>
              <label>Wholesaler
                <select className="form-control" required value={form.wholesalerId} onChange={(e) => setForm((prev) => ({ ...prev, wholesalerId: e.target.value }))}>
                  <option value="">Select wholesaler</option>
                  {visibleWholesalers.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                </select>
              </label>
              {form.items.map((line, index) => (
                <div key={index} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginBottom: 8 }}>
                  <label style={{ flex: "2 1 200px" }}>Variant
                    <select className="form-control" required value={line.productVariantId} onChange={(e) => updateLine(index, "productVariantId", e.target.value)}>
                      <option value="">Select variant</option>
                      {variants.map((v) => <option key={v.id} value={v.id}>{v.productName} - {v.sku}</option>)}
                    </select>
                  </label>
                  <label style={{ flex: "1 1 80px" }}>Qty
                    <input className="form-control" type="number" min="1" step="1" required value={line.quantity} onChange={(e) => updateLine(index, "quantity", e.target.value)} />
                  </label>
                  <label style={{ flex: "1 1 120px" }}>Unit price
                    <input className="form-control" value={line.unitPrice} onChange={(e) => updateLine(index, "unitPrice", e.target.value)} placeholder="auto" />
                  </label>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => removeLine(index)} disabled={form.items.length === 1}>Remove</button>
                </div>
              ))}
              <button type="button" className="btn btn-outline-secondary" onClick={addLine}>Add line</button>
              <p>Preview total: {previewTotal.toFixed(2)} (only manually entered prices)</p>
              <div className="modal-actions">
                <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Submitting..." : "Create Purchase Order"}</button>
                <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PurchaseOrderDetails
        po={selectedPo}
        onClose={() => setSelectedPo(null)}
        onChanged={load}
      />
    </div>
  );
}
