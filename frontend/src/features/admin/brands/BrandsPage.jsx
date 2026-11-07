import { useState, useEffect, useRef } from 'react';
import { adminApi } from '../../../services/admin/index.js';
import { resolveMediaUrl } from '../../../services/apiClient.js';
import Modal from '../../../components/common/Modal.jsx';
import { Notice } from '../../../components/admin/WorkspaceFeedback.jsx';
import { PendingApprovalModal } from '../../../components/admin/PendingApprovalModal.jsx';

function useImagePreview(file) {
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!file) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return previewUrl;
}

export function BrandManagement({ items, onReload, loading = false }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const imagePreview = useImagePreview(imageFile);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState('');
  const [query, setQuery] = useState('');
  const fileInputRef = useRef(null);

  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);

  async function loadRequests() {
    setRequestsLoading(true);
    try {
      const result = await adminApi.requests();
      setRequests(result.items || result || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRequestsLoading(false);
    }
  }

  useEffect(() => { loadRequests(); }, []);

  const pendingRequests = (requests ?? []).filter((request) => request.status === 'PENDING' && request.type === 'BRAND');

  const filteredItems = (items ?? []).filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const hasImage = (items ?? []).some((item) => item.logoUrl || item.imageUrl);

  function resetForm() { setName(''); setDescription(''); setImageFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }

  function openCreate() { resetForm(); setEditing(null); setCreateOpen(true); setError(''); setNotice(''); }
  function editBrand(brand) { setEditing(brand); setName(brand.name); setDescription(brand.description || ''); setImageFile(null); setError(''); setNotice(''); }
  function cancelEdit() { setEditing(null); setCreateOpen(false); resetForm(); setError(''); }

  async function saveBrand(event) {
    event.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      const uploadedImageUrl = imageFile ? await adminApi.uploadBrandImage(imageFile) : null;
      const body = { name: name.trim(), description: description.trim() || null, ...(uploadedImageUrl ? { logoUrl: uploadedImageUrl } : editing?.logoUrl ? { logoUrl: editing.logoUrl } : {}) };
      if (editing) await adminApi.updateBrand(editing.id, body);
      else await adminApi.createBrand(body);
      setNotice(editing ? 'Brand updated.' : 'Brand created.');
      cancelEdit();
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleBrand(brand) {
    if (togglingId) return;
    setTogglingId(brand.id); setError('');
    try {
      await adminApi.updateBrand(brand.id, { isActive: !brand.isActive });
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setTogglingId('');
    }
  }

  return (
    <>
      <Notice error={error} notice={notice} />
      <section className="workspace-card">
        <div className="workspace-card-heading">
          <div><h3>Brands</h3><p>Maintain the shared brand directory.</p></div>
          <div className="page-actions">
            <button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={onReload}>{'\u21BB'}</button>
            <button className="btn btn-outline-primary" type="button" onClick={() => setPendingOpen(true)}>Pending Approval ({pendingRequests.length})</button>
            <button className="btn btn-primary" type="button" onClick={openCreate}>+ Add brand</button>
          </div>
        </div>
      </section>
      <section className="workspace-card">
        {!filteredItems.length ? <div className="empty-state">No brands have been created yet.</div> : (
          <div className="table-responsive">
            <table className="table align-middle workspace-table" aria-label="Brands">
              <thead><tr>
                {hasImage && <th scope="col">Image</th>}
                <th scope="col">Name</th>
                <th scope="col">Description</th>
                <th scope="col">Products</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr></thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    {hasImage && <td>{(item.logoUrl || item.imageUrl) && <img className="record-thumb" src={resolveMediaUrl(item.logoUrl || item.imageUrl)} alt="" />}</td>}
                    <td><strong>{item.name}</strong></td>
                    <td>{item.description || '—'}</td>
                    <td>{(item._count?.products ?? 0)} products</td>
                    <td><button type="button" className={`status-pill ${item.isActive ? 'active' : 'inactive'} status-toggle`} disabled={togglingId === item.id} onClick={() => toggleBrand(item)}>{togglingId === item.id ? 'Saving...' : item.isActive ? 'ACTIVE' : 'INACTIVE'}</button></td>
                    <td><div className="row-actions"><button className="btn btn-sm btn-outline-secondary" onClick={() => { editBrand(item); setCreateOpen(true); }}>Edit</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Modal open={createOpen} title={editing ? 'Edit brand' : 'Add global brand'} onClose={cancelEdit}>
        <Notice error={error} />
        <form className="workspace-form" onSubmit={saveBrand}>
          <label>Brand name<input className="form-control" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Description<textarea className="form-control" rows="2" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label>Brand image<input className="form-control" ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] || null)} /></label>
          {imagePreview && <img className="record-thumb" src={imagePreview} alt="Preview" />}
          {!imagePreview && editing && (editing.logoUrl || editing.imageUrl) && <img className="record-thumb" src={resolveMediaUrl(editing.logoUrl || editing.imageUrl)} alt="Current" />}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Add brand'}</button>
            <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={cancelEdit}>Cancel</button>
          </div>
        </form>
      </Modal>
      <PendingApprovalModal
        open={pendingOpen}
        onClose={() => setPendingOpen(false)}
        title={`Pending Brand Approvals (${pendingRequests.length})`}
        items={pendingRequests}
        loading={requestsLoading}
        onApprove={async (id) => {
          await adminApi.reviewMasterDataRequest(id, { decision: 'APPROVED' });
          await loadRequests();
          onReload();
          setNotice('Request approved.');
        }}
        onReject={async (id, reason) => {
          await adminApi.reviewMasterDataRequest(id, { decision: 'REJECTED', rejectionReason: reason });
          await loadRequests();
          onReload();
          setNotice('Request rejected.');
        }}
      />
    </>
  );
}
