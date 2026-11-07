import { useState, useEffect, useRef } from 'react';
import { adminApi } from '../../services/admin/index.js';
import { resolveMediaUrl } from '../../services/apiClient.js';
import Modal from '../../components/common/Modal.jsx';
import { Notice } from '../../components/admin/WorkspaceFeedback.jsx';
import { PendingApprovalModal } from '../../components/admin/PendingApprovalModal.jsx';

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

export function VariantManagement({ items, onReload, loading = false }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [valuesInput, setValuesInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const imagePreview = useImagePreview(imageFile);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [valueDrafts, setValueDrafts] = useState({});
  const [togglingAttributeId, setTogglingAttributeId] = useState('');
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

  const pendingRequests = (requests ?? []).filter((request) => request.status === 'PENDING' && (request.type === 'VARIANT_ATTRIBUTE' || request.type === 'VARIANT_VALUE'));

  function resetForm() { setName(''); setDescription(''); setValuesInput(''); setImageFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }

  function openCreate() { resetForm(); setEditing(null); setCreateOpen(true); setError(''); setNotice(''); }
  function editAttribute(attribute) { setEditing(attribute); setName(attribute.name); setDescription(attribute.description || ''); setValuesInput(''); setImageFile(null); setCreateOpen(true); setError(''); setNotice(''); }
  function cancelEdit() { setEditing(null); setCreateOpen(false); resetForm(); setError(''); }

  async function uploadImageIfNeeded(file) {
    if (!file) return null;
    return adminApi.uploadVariantAttributeImage(file);
  }

  async function createValuesForAttribute(attributeId, values) {
    const existing = (items.find((item) => item.id === attributeId)?.values || []).map((v) => v.value.toLowerCase());
    const unique = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
    for (const value of unique) {
      if (existing.includes(value.toLowerCase())) continue;
      try {
        await adminApi.createVariantValue(attributeId, value);
      } catch (e) {
        // ignore duplicate errors
      }
    }
  }

  async function saveAttribute(event) {
    event.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      const uploadedImageUrl = await uploadImageIfNeeded(imageFile);
      if (editing) {
        await adminApi.updateVariantAttribute(editing.id, {
          name: name.trim(),
          description: description.trim() || null,
          ...(uploadedImageUrl ? { imageUrl: uploadedImageUrl } : editing.imageUrl ? { imageUrl: editing.imageUrl } : {}),
        });
        const values = valuesInput.split(',').map((v) => v.trim()).filter(Boolean);
        if (values.length) await createValuesForAttribute(editing.id, values);
        setNotice('Variant attribute updated.');
      } else {
        const created = await adminApi.createVariantAttribute({ name: name.trim(), description: description.trim() || null, ...(uploadedImageUrl ? { imageUrl: uploadedImageUrl } : {}) });
        const values = valuesInput.split(',').map((v) => v.trim()).filter(Boolean);
        if (values.length && created?.id) await createValuesForAttribute(created.id, values);
        setNotice('Variant attribute created.');
      }
      cancelEdit();
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function addValue(attributeId) {
    const value = valueDrafts[attributeId]?.trim();
    if (!value) return;
    setError('');
    try {
      await adminApi.createVariantValue(attributeId, value);
      setValueDrafts({ ...valueDrafts, [attributeId]: '' });
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function updateAttribute(attribute) {
    if (togglingAttributeId) return;
    setTogglingAttributeId(attribute.id); setError('');
    try {
      await adminApi.updateVariantAttribute(attribute.id, { isActive: !attribute.isActive });
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setTogglingAttributeId('');
    }
  }

  async function updateValue(attributeId, value) {
    setError('');
    try {
      await adminApi.updateVariantValue(attributeId, value.id, { isActive: !value.isActive });
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const hasImage = (items ?? []).some((item) => item.imageUrl);

  return (
    <>
      <Notice error={error} notice={notice} />

      <section className="workspace-card">
        <div className="workspace-card-heading">
          <div><h3>Variant attributes</h3><p>Manage global attributes and their allowed values.</p></div>
          <div className="page-actions">
            <button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={onReload}>{'\u21BB'}</button>
            <button className="btn btn-outline-primary" type="button" onClick={() => setPendingOpen(true)}>Pending Approval ({pendingRequests.length})</button>
            <button className="btn btn-primary" type="button" onClick={openCreate}>+ Add attribute</button>
          </div>
        </div>
      </section>
      <section className="workspace-card">
        {!items.length ? <div className="empty-state">No variant attributes have been created yet.</div> : (
          <div className="table-responsive">
            <table className="table align-middle workspace-table" aria-label="Variant attributes">
              <thead><tr>
                {hasImage && <th scope="col">Image</th>}
                <th scope="col">Attribute</th>
                <th scope="col">Values</th>
                <th scope="col">Description</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr></thead>
              <tbody>
                {items.map((attribute) => (
                  <tr key={attribute.id}>
                    {hasImage && <td>{attribute.imageUrl && <img className="record-thumb" src={resolveMediaUrl(attribute.imageUrl)} alt="" />}</td>}
                    <td><strong>{attribute.name}</strong></td>
                    <td>
                      <div className="value-chips">{attribute.values.map((item) => <span className={`value-chip ${item.isActive ? '' : 'inactive'}`} key={item.id}>{item.value}<button type="button" aria-label={`${item.isActive ? 'Deactivate' : 'Reactivate'} ${item.value}`} onClick={() => updateValue(attribute.id, item)}>{item.isActive ? '\u00D7' : '\u21BB'}</button></span>)}</div>
                      <div className="value-entry"><input aria-label={`New ${attribute.name} value`} placeholder="Add a value" disabled={!attribute.isActive} value={valueDrafts[attribute.id] || ''} onChange={(event) => setValueDrafts({ ...valueDrafts, [attribute.id]: event.target.value })} /><button className="btn btn-sm btn-outline-primary" disabled={!attribute.isActive} onClick={() => addValue(attribute.id)}>Add</button></div>
                    </td>
                    <td>{attribute.description || '—'}</td>
                    <td><button type="button" className={`status-pill ${attribute.isActive ? 'active' : 'inactive'} status-toggle`} disabled={togglingAttributeId === attribute.id} onClick={() => updateAttribute(attribute)}>{togglingAttributeId === attribute.id ? 'Saving...' : attribute.isActive ? 'ACTIVE' : 'INACTIVE'}</button></td>
                    <td><div className="row-actions"><button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => editAttribute(attribute)}>Edit</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Modal open={createOpen} title={editing ? 'Edit variant attribute' : 'Add variant attribute'} onClose={cancelEdit}>
        <Notice error={error} />
        <form className="workspace-form" onSubmit={saveAttribute}>
          <label>Attribute name<input className="form-control" required minLength={2} maxLength={80} placeholder="Size, Colour, Storage..." value={name} onChange={(event) => setName(event.target.value)} /></label>
{editing && editing.values?.length ? <div className="value-chips">{editing.values.map((v) => <span className="value-chip" key={v.id}>{v.value}</span>)}</div> : null}
          <label>Values (comma-separated, new values only)<input className="form-control" placeholder="S, M, L, XL" value={valuesInput} onChange={(event) => setValuesInput(event.target.value)} /></label>
          <label>Description<textarea className="form-control" rows="2" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>Attribute image<input className="form-control" ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || null)} /></label>
          {imagePreview && <img className="record-thumb" src={imagePreview} alt="Preview" />}
          {!imagePreview && editing?.imageUrl && <img className="record-thumb" src={resolveMediaUrl(editing.imageUrl)} alt="Current" />}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Add attribute'}</button>
            <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={cancelEdit}>Cancel</button>
          </div>
        </form>
      </Modal>
      <PendingApprovalModal
        open={pendingOpen}
        onClose={() => setPendingOpen(false)}
        title={`Pending Variant / Attribute Approvals (${pendingRequests.length})`}
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
