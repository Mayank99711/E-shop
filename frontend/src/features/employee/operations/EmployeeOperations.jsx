import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../services/apiClient.js";
import "./EmployeeOperations.css";

export default function EmployeeOperations({ mode }) {
  const isDelivery = mode === "delivery";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const load = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest(`/api/employee/${isDelivery ? "delivery" : "customers"}`, {
        portal: "shop-owner", ...(signal ? { signal } : {}),
      });
      if (signal?.aborted) return;
      if (!Array.isArray(response?.items)) throw new Error("Unexpected server response.");
      setRows(response.items);
    } catch (err) {
      if (signal?.aborted) return;
      setRows([]);
      setError(err?.message || "Unable to load records.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [isDelivery]);
  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);
  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    return value ? rows.filter(row => [row.name, row.orderNumber, row.status].some(v => String(v || "").toLowerCase().includes(value))) : rows;
  }, [rows, search]);
  const date = value => value ? new Date(value).toLocaleDateString("en-IN") : "-";
  return <section className="employee-panel employee-operations">
    <div className="employee-operations-header">
      <div><h2>{isDelivery ? "Delivery tracking" : "Shop customers"}</h2>
      <p>{isDelivery ? "Read-only fulfilment status for your shop's recent orders." : "Customers who placed one of your shop's 100 most recent orders."}</p></div>
      <button className="employee-secondary-btn" type="button" onClick={() => load()} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
    </div>
    {!loading && !error && <div className="employee-operations-search">
      <input className="form-control" type="search" aria-label={isDelivery ? "Search deliveries" : "Search customers"} placeholder={isDelivery ? "Order number or status" : "Customer name"} value={search} onChange={e => setSearch(e.target.value)}/>
      <small>{filtered.length} of {rows.length} records</small>
    </div>}
    {loading ? <p role="status" className="employee-operations-state">Loading records...</p>
      : error ? <div className="employee-operations-state" role="alert"><p>{error}</p><button type="button" className="employee-secondary-btn" onClick={() => load()}>Try again</button></div>
      : !filtered.length ? <p className="employee-operations-state">{search ? "No matching records." : "No records found for your shop."}</p>
      : <div className="employee-operations-table-wrap"><table className="employee-operations-table"><thead><tr>
          {isDelivery ? <><th>Order</th><th>Fulfilment status</th><th>Ordered</th><th>Last updated</th></> : <><th>Customer</th><th>Orders in recent 100</th><th>Latest order</th></>}
        </tr></thead><tbody>{filtered.map(row => <tr key={row.id}>
          {isDelivery ? <><td><strong>{row.orderNumber}</strong></td><td><span className="employee-operations-tag">{String(row.status).replaceAll("_", " ")}</span></td><td>{date(row.createdAt)}</td><td>{date(row.updatedAt)}</td></> : <><td><strong>{row.name}</strong></td><td>{row.orderCount}</td><td>{date(row.lastOrderAt)}</td></>}
        </tr>)}</tbody></table></div>}
  </section>;
}
