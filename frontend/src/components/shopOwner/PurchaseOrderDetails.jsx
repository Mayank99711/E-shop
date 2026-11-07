import { useEffect, useState } from "react";
import { shopOwnerApi } from "../../services/shopOwner/index.js";

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(value || 0));
}

function createInitialLines(items) {
  return (items || []).map((item) => ({
    purchaseOrderItemId: item.id,
    quantityReceived: "",
    quantityAccepted: "",
    quantityDamaged: "0",
    quantityMissing: "0",
  }));
}

export function PurchaseOrderDetails({ po, onClose, onChanged }) {
  const [order, setOrder] = useState(po);
  const [editingPo,setEditingPo]=useState(false);
  const [expectedDate,setExpectedDate]=useState("");
  const [receipts, setReceipts] = useState([]);
  const [showReceiptForm, setShowReceiptForm] = useState(false);

  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setOrder(po);
    setExpectedDate(po?.expectedAt?String(po.expectedAt).slice(0,10):"");
    setEditingPo(false);
    setLines(createInitialLines(po?.items));
    setReceipts(po?.receipts || []);
    setShowReceiptForm(false);
    setError("");
    setNotice("");
  }, [po]);

  if (!po) return null;

  const orderItems = order?.items || [];

  async function refreshDetails() {
    const [poResponse, receiptResponse] = await Promise.all([
      shopOwnerApi.purchaseOrder(po.id),
      shopOwnerApi.goodsReceipts(po.id),
    ]);

    const updatedOrder =
      poResponse.purchaseOrder || poResponse;

    setOrder(updatedOrder);
    setReceipts(receiptResponse.items || []);
    setLines(createInitialLines(updatedOrder.items));

    return updatedOrder;
  }

  function updateLine(index, field, value) {
    setLines((previous) =>
      previous.map((line, position) =>
        position === index
          ? { ...line, [field]: value }
          : line
      )
    );
  }

  function openReceiptForm() {
    setLines(createInitialLines(orderItems));
    setError("");
    setNotice("");
    setShowReceiptForm(true);
  }

  function validateLines() {
    let hasReceivedItems = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      const received = Number(line.quantityReceived || 0);
      const accepted = Number(line.quantityAccepted || 0);
      const damaged = Number(line.quantityDamaged || 0);
      const missing = Number(line.quantityMissing || 0);

      const values = [received, accepted, damaged, missing];

      if (
        values.some(
          (value) => !Number.isInteger(value) || value < 0
        )
      ) {
        throw new Error(
          `Item ${index + 1}: quantities must be non-negative whole numbers.`
        );
      }

      if (received > 0) hasReceivedItems = true;

      if (accepted + damaged + missing > received) {
        throw new Error(
          `Item ${index + 1}: accepted, damaged and missing cannot exceed received quantity.`
        );
      }

      const item = orderItems[index];
      const remaining =
        item.quantityOrdered - item.receivedQuantity;

      if (accepted > remaining) {
        throw new Error(
          `Item ${index + 1}: accepted quantity cannot exceed ${remaining} remaining units.`
        );
      }
    }

    if (!hasReceivedItems) {
      throw new Error(
        "Enter received quantity for at least one item."
      );
    }
  }

  async function handleCreateReceipt(event) {
    event.preventDefault();

    if (busy) return;

    setError("");
    setNotice("");

    try {
      validateLines();

      setBusy(true);

      const payload = {
        items: lines.map((line) => ({
          purchaseOrderItemId: line.purchaseOrderItemId,
          quantityReceived: Number(
            line.quantityReceived || 0
          ),
          quantityAccepted: Number(
            line.quantityAccepted || 0
          ),
          quantityDamaged: Number(
            line.quantityDamaged || 0
          ),
          quantityMissing: Number(
            line.quantityMissing || 0
          ),
        })),
      };

      await shopOwnerApi.createGoodsReceipt(
        po.id,
        payload
      );

      await refreshDetails();

      setShowReceiptForm(false);
      setNotice(
        "Goods Receipt saved as Draft. Inventory has not changed yet."
      );

      onChanged?.();
    } catch (requestError) {
      setError(
        requestError.message ||
          "Unable to create Goods Receipt."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmReceipt(receipt) {
    if (busy || receipt.status !== "DRAFT") return;

    const acceptedQuantity = (receipt.items || []).reduce(
      (total, item) =>
        total + Number(item.quantityAccepted || 0),
      0
    );

    const confirmed = window.confirm(
      `Confirm this Goods Receipt?\n\n` +
        `${acceptedQuantity} accepted units will be added to inventory.\n\n` +
        `This action cannot be undone from this screen.`
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await shopOwnerApi.confirmGoodsReceipt(receipt.id);

      await refreshDetails();

      setNotice(
        "Goods Receipt confirmed. Accepted stock has been added to inventory."
      );

      onChanged?.();
    } catch (requestError) {
      setError(
        requestError.message ||
          "Unable to confirm Goods Receipt."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setLoading(true);
    setError("");

    try {
      await refreshDetails();
    } catch (requestError) {
      setError(
        requestError.message || "Unable to refresh details."
      );
    } finally {
      setLoading(false);
    }
  }

  async function savePurchaseOrderExpectedDate(){setBusy(true);setError("");try{await shopOwnerApi.updatePurchaseOrderDate(order.id,{expectedAt:expectedDate?new Date(expectedDate+"T12:00:00Z").toISOString():null});await refreshDetails();setEditingPo(false);setNotice("Expected delivery date updated.");onChanged?.();}catch(e){setError(e.message||"Unable to update PO");}finally{setBusy(false);}}
  const canCreateReceipt =
    order?.status !== "CANCELLED" &&
    order?.status !== "RECEIVED" &&
    orderItems.some(
      (item) =>
        item.receivedQuantity < item.quantityOrdered
    );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1055,
        background: "rgba(15, 23, 42, 0.65)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        className="card shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-order-details-title"
        style={{
          width: "min(950px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">
          <div>
            <h5
              id="purchase-order-details-title"
              className="fw-bold mb-1"
            >
              Purchase Order {order?.id?.slice(0, 8)}
            </h5>
            <div className="text-muted small">
              Manage order items and goods receipts
            </div>
          </div>

          <button
            type="button"
            className="btn-close"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          />
        </div>

        <div className="card-body p-3 p-md-4">
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          {notice && (
            <div className="alert alert-success" role="status">
              {notice}
            </div>
          )}

          {/* Order summary */}
          <div className="row g-3 mb-4">
            <div className="col-sm-4">
              <div className="border rounded p-3 h-100">
                <div className="small text-muted mb-1">
                  Order Status
                </div>
                <span className="badge bg-primary-subtle text-primary">
                  {order?.status}
                </span>
              </div>
            </div>

            <div className="col-sm-4">
              <div className="border rounded p-3 h-100">
                <div className="small text-muted mb-1">
                  Wholesaler
                </div>
                <strong>
                  {order?.wholesaler?.name || "-"}
                </strong>
              </div>
            </div>

            <div className="col-sm-4">
              <div className="border rounded p-3 h-100">
                <div className="small text-muted mb-1">
                  Order Amount
                </div>
                <strong>
                  {formatMoney(order?.totalAmount)}
                </strong>
              </div>
            </div>
          </div>

          <div className="border rounded p-3 mb-3"><strong>Expected Delivery: {order?.expectedAt?String(order.expectedAt).slice(0,10):"Not set"}</strong>{editingPo&&<div className="mt-2"><label className="form-label">Expected delivery date</label><input type="date" className="form-control" value={expectedDate} onChange={e=>setExpectedDate(e.target.value)}/></div>}</div>
          {/* Order items */}
          <h6 className="fw-bold mb-3">
            Purchase Order Items
          </h6>

          <div className="table-responsive mb-4">
            <table className="table table-bordered align-middle">
              <thead className="table-light">
                <tr>
                  <th>SKU</th>
                  <th className="text-end">Ordered</th>
                  <th className="text-end">Received</th>
                  <th className="text-end">Remaining</th>
                </tr>
              </thead>

              <tbody>
                {orderItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.productVariant?.sku ||
                        item.productVariantId}
                    </td>
                    <td className="text-end">
                      {item.quantityOrdered}
                    </td>
                    <td className="text-end">
                      {item.receivedQuantity}
                    </td>
                    <td className="text-end">
                      {Math.max(
                        0,
                        item.quantityOrdered -
                          item.receivedQuantity
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Goods Receipts */}
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <h6 className="fw-bold mb-0">
              Goods Receipts
            </h6>

            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={loading || busy}
                onClick={handleRefresh}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>

              {canCreateReceipt && !showReceiptForm && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy}
                  onClick={openReceiptForm}
                >
                  + Create Goods Receipt
                </button>
              )}
            </div>
          </div>

          {/* Create Receipt form */}
          {showReceiptForm && (
            <form
              className="border rounded p-3 mb-4"
              onSubmit={handleCreateReceipt}
            >
              <h6 className="fw-semibold mb-3">
                New Goods Receipt
              </h6>

              <p className="small text-muted">
                Enter physically received quantities.
                Only accepted items increase inventory
                after confirmation.
              </p>

              <div className="table-responsive">
                <table className="table align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>SKU</th>
                      <th>Received</th>
                      <th>Accepted</th>
                      <th>Damaged</th>
                      <th>Missing</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map((line, index) => {
                      const item = orderItems[index];

                      return (
                        <tr key={line.purchaseOrderItemId}>
                          <td>
                            <div className="fw-semibold">
                              {item.productVariant?.sku ||
                                item.productVariantId?.slice(
                                  0,
                                  8
                                )}
                            </div>
                            <small className="text-muted">
                              Remaining:{" "}
                              {Math.max(
                                0,
                                item.quantityOrdered -
                                  item.receivedQuantity
                              )}
                            </small>
                          </td>

                          {[
                            "quantityReceived",
                            "quantityAccepted",
                            "quantityDamaged",
                            "quantityMissing",
                          ].map((field) => (
                            <td key={field}>
                              <input
                                type="number"
                                className="form-control"
                                style={{ minWidth: 85 }}
                                min="0"
                                step="1"
                                required
                                value={line[field]}
                                onChange={(event) =>
                                  updateLine(
                                    index,
                                    field,
                                    event.target.value
                                  )
                                }
                                aria-label={`${field} for item ${index + 1}`}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="d-flex justify-content-end gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={busy}
                  onClick={() => setShowReceiptForm(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy}
                >
                  {busy
                    ? "Saving..."
                    : "Save Goods Receipt"}
                </button>
              </div>
            </form>
          )}

          {/* Receipt history */}
          {receipts.length === 0 ? (
            <div className="empty-state text-center py-4">
              No Goods Receipts created yet.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Receipt ID</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Accepted Qty</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {receipts.map((receipt) => {
                    const acceptedQty = (
                      receipt.items || []
                    ).reduce(
                      (sum, item) =>
                        sum +
                        Number(
                          item.quantityAccepted || 0
                        ),
                      0
                    );

                    return (
                      <tr key={receipt.id}>
                        <td className="fw-medium">
                          {receipt.id.slice(0, 8)}
                        </td>

                        <td>
                          {receipt.receivedAt
                            ? new Date(
                                receipt.receivedAt
                              ).toLocaleDateString("en-IN")
                            : "-"}
                        </td>

                        <td>
                          <span
                            className={`badge ${
                              receipt.status === "CONFIRMED"
                                ? "bg-success-subtle text-success"
                                : "bg-warning-subtle text-warning-emphasis"
                            }`}
                          >
                            {receipt.status}
                          </span>
                        </td>

                        <td>{acceptedQty}</td>

                        <td>
                          {receipt.status === "DRAFT" ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              disabled={busy}
                              onClick={() =>
                                handleConfirmReceipt(
                                  receipt
                                )
                              }
                            >
                              Confirm Receipt
                            </button>
                          ) : (
                            <span className="text-success small">
                              Confirmed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="card-footer bg-white d-flex justify-content-between align-items-center py-3"><div className="d-flex gap-2">{["DRAFT","SUBMITTED"].includes(order?.status)&&receipts.length===0&&(editingPo?<><button type="button" className="btn btn-primary" disabled={busy} onClick={savePurchaseOrderExpectedDate}>Save Changes</button><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={()=>{setExpectedDate(order?.expectedAt?String(order.expectedAt).slice(0,10):"");setEditingPo(false)}}>Cancel</button></>:<button type="button" className="btn btn-outline-primary" onClick={()=>setEditingPo(true)}>Edit</button>)}</div>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
