import { useState } from 'react';
import { adminApi } from '../../services/admin/index.js';
import { Notice } from '../../components/admin/WorkspaceFeedback.jsx';
import { resolveMediaUrl } from '../../services/apiClient.js';
import Modal from '../../components/common/Modal.jsx';

export function RequestReview({ items, onReload, loading = false }) {
  const [rejection, setRejection] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null);

  async function decide(item, decision) {
    setError('');
    setNotice('');
    const rejectionReason = rejection[item.id]?.trim();
    if (decision === 'REJECTED' && !rejectionReason) {
      setError('Enter a reason before rejecting a request.');
      return;
    }
    try {
      await adminApi.reviewMasterDataRequest(item.id, { decision, ...(decision === 'REJECTED' ? { rejectionReason } : {}) });
      setNotice(`Request ${decision.toLowerCase()}.`);
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function requestTypeLabel(item) {
    if (item.type === 'CATEGORY') {
      return item.proposedData?.parentId ? 'Subcategory' : 'Category';
    }
    if (item.type === 'BRAND') return 'Brand';
    if (item.type === 'VARIANT_ATTRIBUTE') return 'Variant Attribute';
    if (item.type === 'VARIANT_VALUE') return 'Variant Value';
    return item.type.replaceAll('_', ' ');
  }

  function requestSummary(item) {
    const data = item.proposedData || {};
    if (item.type === 'CATEGORY') return data.name || 'Unnamed category';
    if (item.type === 'BRAND') return data.name || 'Unnamed brand';
    if (item.type === 'VARIANT_ATTRIBUTE') return data.name || 'Unnamed attribute';
    if (item.type === 'VARIANT_VALUE') return data.value ? `Value: ${data.value}` : 'Unnamed value';
    return 'Request details available in View Details.';
  }

  function imageUrls(item) {
    const data = item.proposedData || {};
    return [data.iconUrl, data.imageUrl, data.logoUrl].filter(Boolean);
  }

  return (
    <>
      <Notice error={error} notice={notice} />
      <section className="workspace-card">
        <div className="workspace-card-heading">
          <div>
            <h2>Data Requests</h2>
            <p>Review catalog requests submitted by Shop Owners before they become shared marketplace data.</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={onReload}>
              {'\u21BB'}
            </button>
          </div>
        </div>
      </section>

      <section className="workspace-card">
        {!items.length ? (
          <div className="empty-state">No master-data requests to review.</div>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle workspace-table" aria-label="Data requests">
              <thead>
                <tr>
                  <th scope="col">Request Type</th>
                  <th scope="col">Submitted By / Shop</th>
                  <th scope="col">Submitted Date</th>
                  <th scope="col">Request Details</th>
                  <th scope="col">Status</th>
                  <th scope="col">Review Actions</th>
                </tr>
              </thead>
              <tbody>

                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="status-pill">{requestTypeLabel(item)}</span>
                    </td>
                    <td>
                      <strong>{item.requester?.name || 'Unknown requester'}</strong>
                      <small>{item.shop?.name || 'Unknown shop'}</small>
                    </td>
                    <td>{new Date(item.createdAt).toLocaleString()}</td>
                    <td>
                      <div className="request-summary">
                        <strong>{requestSummary(item)}</strong>
                        {imageUrls(item).length > 0 && (
                          <div className="request-preview">
                            {imageUrls(item).map((url) => (
                              <img key={url} className="record-thumb" src={resolveMediaUrl(url)} alt="" />
                            ))}
                          </div>
                        )}
                        <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setSelected(item)}>
                          View Details
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span>
                      {item.reviewer && (
                        <small>Reviewed by {item.reviewer.name}</small>
                      )}
                      {item.reviewedAt && (
                        <small>{new Date(item.reviewedAt).toLocaleString()}</small>
                      )}
                      {item.rejectionReason && (
                        <small>Reason: {item.rejectionReason}</small>
                      )}
                    </td>
                    <td>
                      {item.status === 'PENDING' ? (
                        <div className="request-actions">
                          <button className="btn btn-sm btn-success" type="button" onClick={() => decide(item, 'APPROVED')}>
                            Approve
                          </button>
                          <input
                            aria-label="Rejection reason"
                            placeholder="Reason required to reject"
                            maxLength="500"
                            value={rejection[item.id] || ''}
                            onChange={(event) => setRejection({ ...rejection, [item.id]: event.target.value })}
                          />
                          <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => decide(item, 'REJECTED')}>
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="muted-copy">Reviewed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={Boolean(selected)} title="Request Details" onClose={() => setSelected(null)}>
        {selected && (
          <div className="request-details">
            <p><strong>Type:</strong> {requestTypeLabel(selected)}</p>
            <p><strong>Status:</strong> {selected.status}</p>
            <p><strong>Submitted by:</strong> {selected.requester?.name || 'Unknown'} ({selected.shop?.name || 'Unknown shop'})</p>
            <p><strong>Submitted:</strong> {new Date(selected.createdAt).toLocaleString()}</p>
            {selected.proposedData?.name && <p><strong>Name:</strong> {selected.proposedData.name}</p>}
            {selected.proposedData?.value && <p><strong>Value:</strong> {selected.proposedData.value}</p>}
            {selected.proposedData?.parentId && <p><strong>Parent category ID:</strong> {selected.proposedData.parentId}</p>}
            {selected.proposedData?.website && <p><strong>Website:</strong> {selected.proposedData.website}</p>}
            {selected.proposedData?.description && <p><strong>Description:</strong> {selected.proposedData.description}</p>}
            {selected.proposedData?.justification && <p><strong>Justification:</strong> {selected.proposedData.justification}</p>}
            {selected.proposedData?.supportingInfo && <p><strong>Supporting info:</strong> {selected.proposedData.supportingInfo}</p>}
            {selected.proposedData?.attributeId && <p><strong>Attribute ID:</strong> {selected.proposedData.attributeId}</p>}
            {imageUrls(selected).length > 0 && (
              <div className="request-preview">
                {imageUrls(selected).map((url) => (
                  <img key={url} className="record-thumb" src={resolveMediaUrl(url)} alt="" />
                ))}
              </div>
            )}
            {selected.rejectionReason && <p><strong>Rejection reason:</strong> {selected.rejectionReason}</p>}
            {selected.reviewer && <p><strong>Reviewed by:</strong> {selected.reviewer.name} {selected.reviewedAt ? `on ${new Date(selected.reviewedAt).toLocaleString()}` : ''}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
