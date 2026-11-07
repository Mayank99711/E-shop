import { useState } from 'react';
import { resolveMediaUrl } from '../../services/apiClient.js';
import Modal from '../common/Modal.jsx';

export function PendingApprovalModal({ open, onClose, title, items, loading, onApprove, onReject }) {
  const [reasons, setReasons] = useState({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function handleApprove(item) {
    setBusyId(item.id);
    setError('');
    try {
      await onApprove(item.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  async function handleReject(item) {
    const reason = (reasons[item.id] || '').trim();
    if (!reason) {
      setError('Enter a rejection reason before rejecting.');
      return;
    }
    setBusyId(item.id);
    setError('');
    try {
      await onReject(item.id, reason);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  function imageUrls(item) {
    const data = item.proposedData || {};
    return [data.iconUrl, data.imageUrl, data.logoUrl].filter(Boolean);
  }

  function requestTitle(item) {
    const data = item.proposedData || {};
    if (item.type === 'CATEGORY') return data.name || 'Unnamed category';
    if (item.type === 'BRAND') return data.name || 'Unnamed brand';
    if (item.type === 'VARIANT_ATTRIBUTE') return data.name || 'Unnamed attribute';
    if (item.type === 'VARIANT_VALUE') return data.value ? `Value: ${data.value}` : 'Unnamed value';
    return 'Request details';
  }

  function requestType(item) {
    if (item.type === 'CATEGORY') return item.proposedData?.parentId ? 'Create subcategory' : 'Create category';
    if (item.type === 'BRAND') return 'Create brand';
    if (item.type === 'VARIANT_ATTRIBUTE') return 'Create attribute';
    if (item.type === 'VARIANT_VALUE') return 'Create attribute value';
    return 'Create';
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      {error && <div className="workspace-notice error" role="alert">{error}</div>}
      {loading ? (
        <div className="empty-state">Loading pending requests...</div>
      ) : !items.length ? (
        <div className="empty-state">No pending requests.</div>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle workspace-table" aria-label="Pending approvals">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Type</th>
                <th scope="col">Shop / Owner</th>
                <th scope="col">Submitted</th>
                <th scope="col">Details</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{requestTitle(item)}</strong></td>
                  <td>{requestType(item)}</td>
                  <td>{item.shop?.name || 'Unknown shop'}{item.requester?.name ? ` / ${item.requester.name}` : ''}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>
                    {item.proposedData?.description && <div>{item.proposedData.description}</div>}
                    {item.proposedData?.value && <div>Value: {item.proposedData.value}</div>}
                    {item.proposedData?.parentId && <div>Parent category ID: {item.proposedData.parentId}</div>}
                    {imageUrls(item).length > 0 && (
                      <div className="request-preview">
                        {imageUrls(item).map((url) => <img key={url} className="record-thumb" src={resolveMediaUrl(url)} alt="" />)}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="request-actions">
                      <button className="btn btn-sm btn-success" type="button" disabled={busyId === item.id} onClick={() => handleApprove(item)}>
                        {busyId === item.id ? 'Processing...' : 'Approve'}
                      </button>
                      <input
                        aria-label="Rejection reason"
                        placeholder="Reason required to reject"
                        maxLength="500"
                        value={reasons[item.id] || ''}
                        onChange={(event) => setReasons({ ...reasons, [item.id]: event.target.value })}
                      />
                      <button className="btn btn-sm btn-outline-danger" type="button" disabled={busyId === item.id} onClick={() => handleReject(item)}>
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
