import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../../services/apiClient.js";
import Modal from "../../../components/common/Modal.jsx";
import "../../employee/delivery/DeliveryProfessional.css";

const labels = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  ASSIGNED: "Pickup assigned",
  COLLECTED: "Collected",
  HANDED_OVER: "At shop",
  PICKUP_FAILED: "Pickup failed",
  RECEIVED: "Received",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

const assignableStatuses = ["APPROVED", "ASSIGNED", "PICKUP_FAILED"];

export default function OwnerReturnManagement() {
  const [data, setData] = useState({ returns: [], employees: [] });
  const [cod, setCod] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [employee, setEmployee] = useState({});
  const [note, setNote] = useState({});
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [modalError, setModalError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [returnsResponse, codResponse] = await Promise.all([
        apiRequest("/api/owner/returns"),
        apiRequest("/api/owner/returns/cod"),
      ]);
      setData(returnsResponse.data || { returns: [], employees: [] });
      setCod(codResponse.items || []);
    } catch (requestError) {
      setError(requestError.message || "Unable to load returns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openReturnModal(returnRequest) {
    setModalError("");
    setSelectedReturn(returnRequest);
  }

  function closeReturnModal() {
    if (busy) return;
    setModalError("");
    setSelectedReturn(null);
  }

  async function change(returnRequest, action) {
    if (busy) return;

    const validActions = {
      REQUESTED: ["approve", "reject"],
      APPROVED: ["assign"],
      ASSIGNED: ["assign"],
      PICKUP_FAILED: ["assign"],
      HANDED_OVER: ["receive"],
      RECEIVED: ["close"],
    };
    if (!validActions[returnRequest.status]?.includes(action)) return;

    const actionNote = (note[returnRequest.id] || "").trim();
    const employeeId = employee[returnRequest.id] || "";

    if (action === "reject" && !actionNote) {
      setModalError("Enter a rejection reason before rejecting this return.");
      return;
    }
    if (action === "assign" && !employeeId) {
      setModalError("Choose a delivery associate before assigning the pickup.");
      return;
    }
    if (["reject", "close"].includes(action) &&
        !window.confirm(`Confirm ${action} for ${returnRequest.orderNumber}?`)) {
      return;
    }

    setBusy(returnRequest.id);
    setError("");
    setModalError("");
    setNotice("");

    try {
      await apiRequest(`/api/owner/returns/${returnRequest.id}/action`, {
        method: "PATCH",
        body: {
          action,
          ...(action === "assign" ? { employeeId } : {}),
          ...(["reject", "close"].includes(action) ? { note: actionNote } : {}),
        },
      });
      setNotice(`Return ${action} completed.`);
      setSelectedReturn(null);
      setNote((previous) => ({ ...previous, [returnRequest.id]: "" }));
      await refresh();
    } catch (requestError) {
      setModalError(requestError.message || "Unable to update return.");
    } finally {
      setBusy("");
    }
  }

  async function verify(cashRecord) {
    if (busy || !window.confirm(`Confirm cash handover of ₹${cashRecord.amount} for ${cashRecord.orderNumber}?`)) return;
    setBusy(cashRecord.id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/owner/returns/cod/${cashRecord.id}/verify`, {
        method: "PATCH",
      });
      setNotice("COD payment marked PAID after verified cash handover.");
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="dp-owner-shell">
      <div className="dp-heading">
        <div>
          <p className="dp-eyebrow">SHOP OWNER / OPERATIONS</p>
          <h2>Returns Management</h2>
          <p>Approve returns, assign reverse pickups and verify cash handed over by delivery associates.</p>
        </div>
        <button type="button" className="btn btn-outline-secondary" onClick={refresh} disabled={loading || !!busy}>
          Refresh
        </button>
      </div>

      {error && <p className="dp-alert" role="alert">{error}</p>}
      {notice && <p className="dp-success" role="status">{notice}</p>}

      <div className="dp-panel">
        <h3>Customer Return Requests</h3>
        {loading ? (
          <p>Loading...</p>
        ) : !data.returns.length ? (
          <p className="dp-muted">No return requests yet.</p>
        ) : (
          <div className="dp-table-wrap">
            <table className="dp-table">
              <thead>
                <tr>
                  <th>Order / Customer</th>
                  <th>Reason</th>
                  <th>Pickup</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.returns.map((returnRequest) => (
                  <tr key={returnRequest.id}>
                    <td>
                      <strong>{returnRequest.orderNumber}</strong>
                      <div>{returnRequest.customerName}</div>
                    </td>
                    <td>
                      {returnRequest.reason}
                      {returnRequest.failureReason && <p>Failure: {returnRequest.failureReason}</p>}
                    </td>
                    <td>{returnRequest.employeeName || "Unassigned"}</td>
                    <td><span className="dp-tag">{labels[returnRequest.status] || returnRequest.status}</span></td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={!!busy}
                        onClick={() => openReturnModal(returnRequest)}
                        aria-label={`Manage return for order ${returnRequest.orderNumber}`}
                      >
                        Action
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="dp-panel">
        <h3>COD Cash Handover</h3>
        <p className="dp-muted">
          Associate records cash at delivery. Only after your cash-received verification is the corresponding COD payment marked PAID.
        </p>
        {!cod.length ? (
          <p className="dp-muted">No COD cash collection records.</p>
        ) : (
          <div className="dp-table-wrap">
            <table className="dp-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Associate</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cod.map((cashRecord) => (
                  <tr key={cashRecord.id}>
                    <td>{cashRecord.orderNumber}</td>
                    <td>{cashRecord.associate}</td>
                    <td>₹{Number(cashRecord.amount).toFixed(2)}</td>
                    <td><span className="dp-tag">{cashRecord.status}</span></td>
                    <td>
                      {cashRecord.status === "COLLECTED" ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-success"
                          disabled={!!busy}
                          onClick={() => verify(cashRecord)}
                        >
                          Confirm Cash Received
                        </button>
                      ) : (
                        <span>Verified</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(selectedReturn)}
        title="Manage Return"
        onClose={closeReturnModal}
        className="owner-return-action-modal"
      >
        {selectedReturn && (
          <div className="owner-return-action-content">
            <div className="owner-return-action-summary">
              <div>
                <span className="owner-return-action-label">Order Number</span>
                <strong>{selectedReturn.orderNumber}</strong>
              </div>
              <div>
                <span className="owner-return-action-label">Customer</span>
                <strong>{selectedReturn.customerName}</strong>
              </div>
              <div>
                <span className="owner-return-action-label">Current Status</span>
                <span className="dp-tag">{labels[selectedReturn.status] || selectedReturn.status}</span>
              </div>
              <div>
                <span className="owner-return-action-label">Pickup Associate</span>
                <strong>{selectedReturn.employeeName || "Unassigned"}</strong>
              </div>
            </div>

            <div className="owner-return-action-reason">
              <strong>Return Reason</strong>
              <p>{selectedReturn.reason}</p>
              {selectedReturn.failureReason && (
                <p><strong>Pickup failure:</strong> {selectedReturn.failureReason}</p>
              )}
            </div>

            {modalError && <p className="dp-alert" role="alert">{modalError}</p>}

            <div className="owner-return-action-form">
              <h3>Available Actions</h3>

              {selectedReturn.status === "REQUESTED" && (
                <>
                  <p className="dp-muted">Approve the request or provide a rejection reason.</p>
                  <label htmlFor="return-rejection-reason">Rejection reason (required for rejection)</label>
                  <textarea
                    id="return-rejection-reason"
                    className="form-control"
                    rows={3}
                    value={note[selectedReturn.id] || ""}
                    disabled={!!busy}
                    onChange={(event) => setNote((previous) => ({ ...previous, [selectedReturn.id]: event.target.value }))}
                    placeholder="Enter reason if rejecting this return"
                  />
                  <div className="owner-return-action-buttons">
                    <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => change(selectedReturn, "approve")}>Approve Return</button>
                    <button type="button" className="btn btn-outline-danger" disabled={!!busy || !(note[selectedReturn.id] || "").trim()} onClick={() => change(selectedReturn, "reject")}>Reject Return</button>
                  </div>
                </>
              )}

              {assignableStatuses.includes(selectedReturn.status) && (
                <>
                  <label htmlFor="return-pickup-associate">Delivery Associate</label>
                  <select
                    id="return-pickup-associate"
                    className="form-select"
                    value={employee[selectedReturn.id] || ""}
                    disabled={!!busy}
                    onChange={(event) => setEmployee((previous) => ({ ...previous, [selectedReturn.id]: event.target.value }))}
                  >
                    <option value="">Choose Associate</option>
                    {data.employees.map((associate) => (
                      <option key={associate.id} value={associate.id}>{associate.name}</option>
                    ))}
                  </select>
                  <div className="owner-return-action-buttons">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!!busy || !employee[selectedReturn.id]}
                      onClick={() => change(selectedReturn, "assign")}
                    >
                      {selectedReturn.status === "APPROVED" ? "Assign Pickup" : "Reassign Pickup"}
                    </button>
                  </div>
                </>
              )}

              {selectedReturn.status === "HANDED_OVER" && (
                <div className="owner-return-action-buttons">
                  <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => change(selectedReturn, "receive")}>Confirm Shop Receipt</button>
                </div>
              )}

              {selectedReturn.status === "RECEIVED" && (
                <>
                  <label htmlFor="return-inspection-note">Inspection / refund decision note</label>
                  <textarea
                    id="return-inspection-note"
                    className="form-control"
                    rows={3}
                    value={note[selectedReturn.id] || ""}
                    disabled={!!busy}
                    onChange={(event) => setNote((previous) => ({ ...previous, [selectedReturn.id]: event.target.value }))}
                    placeholder="Optional inspection or refund decision note"
                  />
                  <p className="dp-muted">Closing the return does not automatically issue a refund.</p>
                  <div className="owner-return-action-buttons">
                    <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => change(selectedReturn, "close")}>Close Return</button>
                  </div>
                </>
              )}

              {!(["REQUESTED", ...assignableStatuses, "HANDED_OVER", "RECEIVED"].includes(selectedReturn.status)) && (
                <p className="dp-muted">No actions are currently available for this return status. You can review its details above.</p>
              )}
            </div>

            <div className="owner-return-action-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={closeReturnModal} disabled={!!busy}>Close</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
