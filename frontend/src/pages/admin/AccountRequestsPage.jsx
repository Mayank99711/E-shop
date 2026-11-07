import { useState } from 'react';
import { adminApi } from '../../services/admin/index.js';
import { Notice } from '../../components/admin/WorkspaceFeedback.jsx';

export function AccountDeletionReview({ items, onReload, loading = false }) {
  const [reasons, setReasons] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  async function review(item, status) {
    const reason = reasons[item.id]?.trim() || "";
    if (status === "REJECTED" && reason.length < 2) {
      setError("Enter a reason of at least 2 characters before rejecting.");
      return;
    }
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      await adminApi.reviewAccountDeletionRequest(item.id, { status, ...(reason ? { reason } : {}) });
      setNotice(status === "ACKNOWLEDGED" ? "Request acknowledged." : "Request rejected.");
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <Notice error={error} notice={notice} />
      <section className="workspace-card">
        <div className="workspace-card-heading">
          <div><h3>Customer account deletion requests</h3><p>Review and record the request. Acknowledging does not automatically erase the account or historical order records.</p></div>
          <div className="page-actions">
            <button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={onReload}>{"\u21BB"}</button>
          </div>
        </div>
        {!items.length ? <div className="empty-state">No account deletion requests have been submitted.</div> : <div className="table-responsive"><table className="table align-middle workspace-table" aria-label="Account deletion requests"><thead><tr>
          <th scope="col">Customer</th>
          <th scope="col">Contact</th>
          <th scope="col">Status</th>
          <th scope="col">Requested</th>
          <th scope="col">Review</th>
        </tr></thead><tbody>
          {items.map((item) => <tr key={item.id}>
            <td><strong>{item.customer.name}</strong>{item.reason && <small>Customer note: {item.reason}</small>}{item.reviewedAt && <small>Reviewed by {item.reviewer?.name || "administrator"} · {new Date(item.reviewedAt).toLocaleString()}</small>}</td>
            <td>{item.customer.email}{item.customer.mobile ? ` · ${item.customer.mobile}` : ""}</td>
            <td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></td>
            <td>{new Date(item.createdAt).toLocaleString()}</td>
            <td>{item.status === "PENDING" ? <div className="row-actions"><label>Rejection reason (required to reject)<input className="form-control" maxLength="500" value={reasons[item.id] || ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} /></label><button className="btn btn-sm btn-outline-primary" type="button" disabled={busyId === item.id} onClick={() => review(item, "ACKNOWLEDGED")}>Acknowledge receipt</button><button className="btn btn-sm btn-outline-danger" type="button" disabled={busyId === item.id} onClick={() => review(item, "REJECTED")}>Reject</button></div> : "Reviewed"}</td>
          </tr>)}
        </tbody></table></div>}
      </section>
    </>
  );
}
