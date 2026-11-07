import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/apiClient.js";
import "./EmployeeOrders.css";

const readableDate = (date) => {
  if (!date) return "—";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
};

function statusLabel(status) {
  return String(status || "UNKNOWN").replace(/_/g, " ");
}

// The service enforces next-step progression and payment verification again on the server.
function nextOrderStatus(current) {
  const transitions = {
    PLACED: "CONFIRMED", CONFIRMED: "PAYMENT_PROCESSING",
    PAYMENT_PROCESSING: "INVENTORY_ALLOCATED", INVENTORY_ALLOCATED: "PICKING",
    PICKING: "PACKED", PACKED: "SHIPPED", SHIPPED: "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "DELIVERED",
  };
  return transitions[current] || null;
}

export default function EmployeeOrders({ canManage = false }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [updateError, setUpdateError] = useState("");

  const loadOrders = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest("/api/employee/orders", {
        portal: "shop-owner",
        ...(signal ? { signal } : {}),
      });
      if (signal?.aborted) return;
      if (!Array.isArray(result?.items)) {
        throw new Error("Unexpected orders response. Please refresh and try again.");
      }
      setOrders(result.items);
    } catch (requestError) {
      if (signal?.aborted) return;
      setOrders([]);
      setError(requestError?.message || "Could not load orders.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadOrders({ signal: controller.signal });
    return () => controller.abort();
  }, [loadOrders]);

  async function advanceOrder(order) {
    const nextStatus = nextOrderStatus(order.status);
    if (!canManage || !nextStatus || updatingId) return;
    if (!window.confirm(`Change order ${order.orderNumber || order.id} from ${statusLabel(order.status)} to ${statusLabel(nextStatus)}?`)) return;
    setUpdatingId(order.id); setUpdateError("");
    try {
      await apiRequest(`/api/employee/orders/${encodeURIComponent(order.id)}/status`, {
        method: "PATCH", body: { status: nextStatus }, portal: "shop-owner",
      });
      await loadOrders();
    } catch (e) {
      setUpdateError(e?.message || "Could not update order status.");
    } finally { setUpdatingId(null); }
  }

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) =>
      [order.orderNumber, order.customerName, order.status]
        .some((field) => String(field || "").toLowerCase().includes(term))
    );
  }, [orders, search]);

  return (
    <section className="employee-panel employee-orders-panel" aria-label="Shop orders">
      <div className="employee-orders-toolbar">
        <div>
          <h2>Shop orders</h2>
          <p>Orders belonging to your assigned shop. View access only.</p>
        </div>
        <button type="button" className="employee-secondary-btn" disabled={loading}
          onClick={() => loadOrders()}>
          {loading ? "Loading…" : "Refresh orders"}
        </button>
      </div>

      {!loading && !error && (
        <div className="employee-orders-filters">
          <label htmlFor="employee-order-search">Search orders</label>
          <input
            id="employee-order-search"
            className="form-control"
            type="search"
            placeholder="Order number, customer, or status"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span>{filteredOrders.length} of {orders.length} orders</span>
        </div>
      )}

      {updateError && <p role="alert" className="employee-orders-state">{updateError}</p>}
      {loading ? (
        <p className="employee-orders-state" role="status">Loading your shop orders…</p>
      ) : error ? (
        <div className="employee-orders-state" role="alert">
          <p>{error}</p>
          <button type="button" className="employee-secondary-btn" onClick={() => loadOrders()}>
            Try again
          </button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="employee-orders-state">
          <h3>{search ? "No matching orders" : "No orders yet"}</h3>
          <p>{search ? "Try a different search." : "Orders for your shop will appear here."}</p>
        </div>
      ) : (
        <div className="employee-orders-table-wrap">
          <table className="employee-orders-table">
            <thead>
              <tr>
                <th scope="col">Order number</th>
                <th scope="col">Customer</th>
                <th scope="col">Items</th>
                <th scope="col">Status</th>
                <th scope="col">Order date</th>
                {canManage && <th scope="col">Action</th>}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td><strong>{order.orderNumber || "—"}</strong></td>
                  <td>{order.customerName || "Customer"}</td>
                  <td>{order.itemCount ?? 0}</td>
                  <td><span className="employee-order-status">{statusLabel(order.status)}</span></td>
                  <td>{readableDate(order.createdAt)}</td>
                  {canManage && <td>
                    {nextOrderStatus(order.status) ? <button type="button" className="employee-secondary-btn"
                      disabled={Boolean(updatingId)} onClick={() => advanceOrder(order)}>
                      {updatingId === order.id ? "Updating..." : `Move to ${statusLabel(nextOrderStatus(order.status))}`}
                    </button> : <span>Final status</span>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
