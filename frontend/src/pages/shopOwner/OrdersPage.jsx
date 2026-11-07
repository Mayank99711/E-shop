import { useMemo, useState, useEffect } from 'react';
import { shopOwnerApi } from '../../services/shopOwner/index.js';
import { ListPagination } from '../../components/shopOwner/ListPagination.jsx';
import { nextOrderStatus, orderStatuses } from './productConfig.js';

export function OrdersSection({ orders, mode = "orders", busy, submit, reload, loading = false }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortOrder, setSortOrder] = useState("NEWEST");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderError, setOrderError] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const deliveryStatuses = ["PLACED", "CONFIRMED", "PAYMENT_PROCESSING", "INVENTORY_ALLOCATED", "PICKING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY"];
  useEffect(() => {
    setStatusFilter(mode === "delivery" ? "IN_PROGRESS" : "ALL");
  }, [mode]);
  const filteredOrders = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();



    return orders
      .filter((order) => statusFilter === "ALL" || (statusFilter === "IN_PROGRESS"
        ? deliveryStatuses.includes(order.status)
        : order.status === statusFilter))
      .filter((order) => !search || [
        order.order.orderNumber,
        order.order.customer.name,
        ...order.items.map(({ productName, sku }) => `${productName} ${sku}`)
      ].some((value) => value.toLocaleLowerCase().includes(search)))
      .sort((left, right) => sortOrder === "OLDEST"
        ? new Date(left.createdAt) - new Date(right.createdAt)
        : new Date(right.createdAt) - new Date(left.createdAt));
  }, [orders, query, sortOrder, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pageOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  // Owner controls preparation only. Pickup and delivery belong to the assigned associate.
  const ownerStages = ["PLACED", "CONFIRMED", "PAYMENT_PROCESSING", "INVENTORY_ALLOCATED", "PICKING", "PACKED"];
  const stageLabel = (value) => value?.replaceAll("_", " ") || "Unknown";
  function openDetails(order) {
    setSelectedOrder(order);
    setDraftStatus(order.status);
    setOrderError("");
  }
  async function advance(order, status) {
    if (savingStatus) return;
    setSavingStatus(true);
    setOrderError("");
    try {
      await shopOwnerApi.setOrderStatus(order.id, status);
      await reload?.();
      setSelectedOrder(null);
    } catch (error) {
      setOrderError(error.message || "Could not update order status. Refresh and try again.");
    } finally {
      setSavingStatus(false);
    }
  }
  const currentOrder = (selectedOrder && orders.find((order) => order.id === selectedOrder.id)) || selectedOrder;
  const stageIndex = currentOrder ? ownerStages.indexOf(currentOrder.status) : -1;
  const selectedStageIndex = ownerStages.indexOf(draftStatus);
  const nextOwnerStage = stageIndex >= 0 && stageIndex < ownerStages.length - 1 ? ownerStages[stageIndex + 1] : null;
  const previousOwnerStage = stageIndex > 0 ? ownerStages[stageIndex - 1] : null;
  // The owner can move one preparation stage forward or backward.
  // Delivery and return statuses remain read-only on the Orders screen.
  const isAdjacentPreparationChange = stageIndex >= 0 && selectedStageIndex >= 0 &&
    Math.abs(selectedStageIndex - stageIndex) === 1;
  const paymentUnverified = currentOrder?.order?.payments?.some((payment) => payment.provider === "RAZORPAY" && payment.status !== "PAID");
  const selectedBlockedByPayment = Boolean(paymentUnverified) &&
    selectedStageIndex >= ownerStages.indexOf("INVENTORY_ALLOCATED");

  return (
    <section className="workspace-card">
      <div className="section-heading"><div><h2>{mode === "delivery" ? "Delivery management" : "Shop orders"} <span className="count-badge">{filteredOrders.length} / {orders.length}</span></h2><p className="muted-copy">{mode === "delivery" ? "Assign deliveries and track progress; delivery associates update pickup and delivery statuses." : "Only fulfilments for your shop are shown."}</p></div><div className="page-actions"><button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={reload}>{"\u21BB"}</button></div></div>
      <div className="list-filters">
        <label>Search orders<input className="form-control" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Order, customer, product, or SKU" /></label>
        <label>Status<select className="form-select" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>{mode === "delivery" && <option value="IN_PROGRESS">Open deliveries</option>}<option value="ALL">All statuses</option>{orderStatuses.map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
        <label>Sort<select className="form-select" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setPage(1); }}><option value="NEWEST">Newest first</option><option value="OLDEST">Oldest first</option></select></label>
      </div>
      {orders.length === 0
        ? <p className="muted-copy">There are no shop orders yet.</p>
        : pageOrders.length === 0
          ? <p className="muted-copy">No orders match these filters.</p>
          : <><div className="table-responsive"><table className="table align-middle workspace-table" aria-label="Shop orders"><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Items</th><th scope="col">Status</th><th scope="col">Payment</th><th scope="col">Shipping</th><th scope="col">Action</th></tr></thead><tbody>
              {pageOrders.map((order) => {
                const payments = order.order.payments || [];
                return <tr key={order.id}>
                  <td><strong>{order.order.orderNumber}</strong><small>{new Date(order.createdAt).toLocaleDateString()}</small></td>
                  <td>{order.order.customer.name}</td>
                  <td><ul className="order-items">{order.items.map((item) => <li key={item.id}>{item.productName} - {item.sku} x {item.quantity}</li>)}</ul></td>
                  <td><span className={order.status === "DELIVERED" ? "status-pill active" : "status-pill"}>{order.status.replaceAll("_", " ")}</span></td>
                  <td>{payments.length ? payments.map((payment, index) => <div key={`${payment.provider}-${index}`}><span>{payment.provider === "RAZORPAY" ? "Razorpay" : payment.provider}</span> <span className={`status-pill ${payment.status.toLowerCase()}`}>{payment.status.replaceAll("_", " ")}</span></div>) : "—"}</td>
                  <td>{order.order.address
                    ? <p className="muted-copy shipping-summary">{[
                      order.order.address.recipient,
                      order.order.address.mobile,
                      order.order.address.line1,
                      order.order.address.line2,
                      order.order.address.city,
                      order.order.address.region,
                      order.order.address.postalCode,
                      order.order.address.country,
                    ].filter(Boolean).join(", ")}</p>
                    : <span className="muted-copy">Address unavailable</span>}</td>
                  <td><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => openDetails(order)}>Manage Order</button></td>
                </tr>;
              })}</tbody></table></div><ListPagination page={page} pageCount={pageCount} onChange={setPage} /></>}
      {currentOrder && <div className="order-workflow-backdrop" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="order-workflow-title" className="order-workflow-dialog card shadow-lg">
          <div className="card-header bg-white d-flex align-items-center justify-content-between gap-3">
            <h3 id="order-workflow-title" className="h5 mb-0">{mode === "delivery" ? "Delivery Details" : "Order Details"} — {currentOrder.order?.orderNumber}</h3>
            <button type="button" className="btn-close" aria-label="Close" onClick={()=>setSelectedOrder(null)} disabled={busy || savingStatus}/>
          </div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <div className="col-sm-6"><span className="text-muted small">Customer</span><div className="fw-semibold">{currentOrder.order?.customer?.name || "—"}</div></div>
              <div className="col-sm-6"><span className="text-muted small">Current status</span><div className="fw-semibold">{currentOrder.status.replaceAll("_", " ")}</div></div>
              <div className="col-sm-6"><span className="text-muted small">Payment</span><div>{(currentOrder.order?.payments || []).map(p=>`${p.provider}: ${p.status}`).join(", ") || "—"}</div></div>
              <div className="col-sm-6"><span className="text-muted small">Delivery address</span><div>{[currentOrder.order?.address?.line1,currentOrder.order?.address?.city,currentOrder.order?.address?.region,currentOrder.order?.address?.postalCode].filter(Boolean).join(", ") || "Address unavailable"}</div></div>
            </div>
            <h4 className="h6">Products</h4>
            <div className="table-responsive mb-3"><table className="table table-sm"><thead><tr><th>Product</th><th>SKU</th><th>Qty</th></tr></thead><tbody>{currentOrder.items.map(item=><tr key={item.id}><td>{item.productName}</td><td>{item.sku}</td><td>{item.quantity}</td></tr>)}</tbody></table></div>
            <div className="alert alert-light border" role="status">
              <strong>Current status:</strong> {stageLabel(currentOrder.status)}
              {nextOwnerStage && <div className="mt-2"><strong>Next preparation step:</strong> {stageLabel(nextOwnerStage)}</div>}
              {previousOwnerStage && <div className="mt-1"><strong>Previous preparation step:</strong> {stageLabel(previousOwnerStage)}</div>}
            </div>
            {stageIndex === ownerStages.indexOf("PACKED") && (
              <p className="text-muted small">Order is packed. Assign a Delivery Associate in Delivery Management. Pickup, Out for Delivery, and Delivered will be updated by the associate.</p>
            )}
            {stageIndex < 0 && (
              <p className="text-muted small">This order is in the delivery, completed, cancelled or return stage. Its delivery status is read-only here. Manage delivery in Delivery Management and returns in Returns.</p>
            )}
            {stageIndex >= 0 && (
              <div className="row g-2 align-items-end mt-2">
                <div className="col-sm">
                  <label htmlFor="owner-order-status" className="form-label fw-semibold">Update Order Status</label>
                  <select
                    id="owner-order-status"
                    className="form-select"
                    value={draftStatus}
                    onChange={(event) => { setDraftStatus(event.target.value); setOrderError(""); }}
                    disabled={busy || savingStatus}
                  >
                    {ownerStages.map((status, index) => (
                      <option
                        key={status}
                        value={status}
                        disabled={Math.abs(index - stageIndex) > 1}
                      >
                        {stageLabel(status)}{index === stageIndex ? " (Current)" : index === stageIndex - 1 ? " (Go Back)" : index === stageIndex + 1 ? " (Next)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-sm-auto">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => advance(currentOrder, draftStatus)}
                    disabled={busy || savingStatus || !isAdjacentPreparationChange || selectedBlockedByPayment}
                  >
                    {savingStatus ? "Updating..." : "Save Status"}
                  </button>
                </div>
              </div>
            )}
            {selectedBlockedByPayment && stageIndex >= 0 && <p className="alert alert-warning mt-2">Verify Razorpay payment before inventory allocation.</p>}
            {orderError && <div className="alert alert-danger" role="alert">{orderError}</div>}
          </div>
          <div className="card-footer bg-white d-flex justify-content-end gap-2 flex-wrap">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setSelectedOrder(null)} disabled={busy || savingStatus}>Close</button>

          </div>
        </section>
      </div>}
    </section>
  );
}
