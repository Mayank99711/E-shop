import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../services/apiClient.js";
import "./EmployeeCatalog.css";

export default function EmployeeCatalog({ mode, canManage = false }) {
  const inventory = mode === "inventory";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [mutationId, setMutationId] = useState(null);
  const [mutationError, setMutationError] = useState("");
  async function changeProductStatus(row) {
    const status = row.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    if (!window.confirm(`Change ${row.name} to ${status}?`)) return;
    setMutationId(row.id); setMutationError("");
    try {
      await apiRequest(`/api/employee/products/${encodeURIComponent(row.id)}/status`, { method: "PATCH", portal: "shop-owner", body: { status } });
      await load();
    } catch (error) { setMutationError(error.message || "Status update failed."); }
    finally { setMutationId(null); }
  }
  async function adjustStock(row) {
    const raw = window.prompt(`Stock adjustment for ${row.sku}. Enter positive or negative units:`, "1");
    if (raw === null) return;
    if (!/^-?\d+$/.test(raw.trim()) || !Number.isSafeInteger(Number(raw)) || !Number(raw) || Math.abs(Number(raw)) > 100000) { setMutationError("Enter a nonzero whole number within 100000 units."); return; }
    const quantity = Number(raw);
    if (!window.confirm(`Adjust ${row.sku} stock by ${quantity > 0 ? "+" : ""}${quantity} units?`)) return;
    setMutationId(row.id); setMutationError("");
    try {
      await apiRequest(`/api/employee/inventory/${encodeURIComponent(row.id)}/adjust`, { method: "POST", portal: "shop-owner", body: { quantity } });
      await load();
    } catch (error) { setMutationError(error.message || "Stock adjustment failed."); }
    finally { setMutationId(null); }
  }

  const load = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest(`/api/employee/${inventory ? "inventory" : "products"}`, {
        portal: "shop-owner", ...(signal ? { signal } : {}),
      });
      if (signal?.aborted) return;
      if (!Array.isArray(result?.items)) throw new Error("Unexpected API response.");
      setRows(result.items);
    } catch (e) {
      if (signal?.aborted) return;
      setRows([]);
      setError(e?.message || "Unable to load data.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [inventory]);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter(r => [r.name, r.sku, r.category, r.brand, r.status].some(v => String(v || "").toLowerCase().includes(q))) : rows;
  }, [rows, search]);
  const money = n => n === null || n === undefined ? "-" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return <section className="employee-panel employee-catalog" aria-label={inventory ? "Inventory" : "Products"}>
    <div className="employee-catalog-toolbar">
      <div><h2>{inventory ? "Shop inventory" : "Shop products"}</h2><p>Read-only records from your assigned shop.</p></div>
      <button type="button" className="employee-secondary-btn" onClick={() => load()} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
    </div>
    {mutationError && <p className="alert alert-danger" role="alert">{mutationError}</p>}
    {!loading && !error && <div className="employee-catalog-search">
      <input className="form-control" aria-label="Search products" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, SKU, category, status" />
      <span>{filtered.length} of {rows.length} {inventory ? "variants" : "products"}</span>
    </div>}
    {loading ? <p role="status" className="employee-catalog-state">Loading {inventory ? "inventory" : "products"}...</p>
    : error ? <div role="alert" className="employee-catalog-state"><p>{error}</p><button type="button" className="employee-secondary-btn" onClick={() => load()}>Try again</button></div>
    : !filtered.length ? <p className="employee-catalog-state">{search ? "No matching records." : "No records found for your shop."}</p>
    : <div className="employee-catalog-table-wrap"><table className="employee-catalog-table">
      <thead><tr>{inventory ? <><th>Product</th><th>SKU</th><th>Variant</th><th>Stock</th><th>Price</th><th>Availability</th>{canManage && <th>Action</th>}</> : <><th>Product</th><th>Category</th><th>Brand</th><th>Status</th><th>Variants</th>{canManage && <th>Action</th>}</>}</tr></thead>
      <tbody>{filtered.map(r => inventory ? <tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.sku}</td><td>{r.variantName || "-"}</td><td>{r.stock}</td><td>{money(r.price)}</td><td><span className="employee-catalog-tag">{r.isActive ? (r.stock > 0 ? "In stock" : "Out of stock") : "Inactive"}</span></td>{canManage && <td><button type="button" className="employee-secondary-btn" disabled={mutationId !== null} onClick={() => adjustStock(r)}>{mutationId === r.id ? "Saving..." : "Adjust stock"}</button></td>}</tr> : <tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.category || "-"}</td><td>{r.brand || "-"}</td><td><span className="employee-catalog-tag">{r.status}</span></td><td>{r.variantCount}</td>{canManage && <td><button type="button" className="employee-secondary-btn" disabled={mutationId !== null} onClick={() => changeProductStatus(r)}>{mutationId === r.id ? "Saving..." : r.status === "ACTIVE" ? "Archive" : "Activate"}</button></td>}</tr>)}</tbody>
    </table></div>}
  </section>;
}
