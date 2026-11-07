import { useState, useEffect } from 'react';
import { adminApi } from '../../../services/admin/index.js';
import { resolveMediaUrl } from '../../../services/apiClient.js';
import Modal from '../../../components/common/Modal.jsx';
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
import { Notice } from '../../../components/admin/WorkspaceFeedback.jsx';

export function ShopCategoryManagement({ items, onReload, loading = false }) {
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

  const resetForm = () => { setName(''); setDescription(''); setImageFile(null); };

  async function createItem(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const uploadedImageUrl = imageFile ? await adminApi.uploadShopCategoryImage(imageFile) : null;
      await adminApi.createShopCategory({ name: name.trim(), description: description.trim() || null, ...(uploadedImageUrl ? { imageUrl: uploadedImageUrl } : {}), isActive: true });
      setNotice('Shop category created.');
      resetForm(); setCreateOpen(false); onReload();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function saveItem(event) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const uploadedImageUrl = imageFile ? await adminApi.uploadShopCategoryImage(imageFile) : null;
      await adminApi.updateShopCategory(editing.id, {
        name: editing.name.trim(),
        description: editing.description?.trim() || null,
        imageUrl: uploadedImageUrl || editing.imageUrl || null,
        isActive: editing.isActive
      });
      setNotice('Shop category updated.');
      setEditing(null); setImageFile(null); onReload();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function toggleItem(item) {
    if (togglingId) return;
    setTogglingId(item.id); setError(''); setNotice('');
    try {
      await adminApi.setShopCategoryStatus(item.id, !item.isActive);
      setNotice('Shop category status updated.');
      onReload();
    } catch (e) { setError(e.message); }
    finally { setTogglingId(''); }
  }
  return (
    <>
      <Notice error={error} notice={notice} />
      <section className="workspace-card">
        <div className="workspace-card-heading">
          <div><h3>Shop Categories</h3><p>Classify the type of shop or business.</p></div>
          <div className="page-actions">
            <button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={onReload}>{'\u21BB'}</button>
            <button className="btn btn-primary" type="button" onClick={() => { resetForm(); setCreateOpen(true); }}>+ Add shop category</button>
          </div>
        </div>
      </section>
      <section className="workspace-card">
        {!items.length ? <div className="empty-state">No shop categories have been created yet.</div> : (
          <div className="table-responsive">
            <table className="table align-middle workspace-table" aria-label="Shop categories">
              <thead><tr><th scope="col">Image</th><th scope="col">Name</th><th scope="col">Description</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.imageUrl && <img className="record-thumb" src={resolveMediaUrl(item.imageUrl)} alt="" />}</td>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.description || '—'}</td>
                    <td><button type="button" className={`status-pill ${item.isActive ? 'active' : 'inactive'} status-toggle`} disabled={togglingId === item.id} onClick={() => toggleItem(item)}>{togglingId === item.id ? 'Saving...' : item.isActive ? 'ACTIVE' : 'INACTIVE'}</button></td>
                    <td><div className="row-actions"><button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing({ id: item.id, name: item.name, description: item.description || '', imageUrl: item.imageUrl || '', isActive: item.isActive })}>Edit</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Modal open={createOpen} title="Add shop category" onClose={() => setCreateOpen(false)}>
        <form className="workspace-form" onSubmit={createItem}>
          <label>Name<input className="form-control" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Description<textarea className="form-control" rows="2" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label>Category Image<input className="form-control" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] || null)} /></label>
          {imagePreview && <img className="record-thumb" src={imagePreview} alt="Preview" />}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Add shop category'}</button>
        </form>
      </Modal>
      <Modal open={Boolean(editing)} title="Edit shop category" onClose={() => setEditing(null)}>
        {editing && <>
          <form className="workspace-form" onSubmit={saveItem}>
            <label>Name<input className="form-control" required minLength={2} maxLength={100} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label>Description<textarea className="form-control" rows="2" maxLength={2000} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
            <label>Category Image<input className="form-control" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] || null)} /></label>
          {imagePreview && <img className="record-thumb" src={imagePreview} alt="Preview" />}
          {!imagePreview && editing?.imageUrl && <img className="record-thumb" src={resolveMediaUrl(editing.imageUrl)} alt="Current" />}
          {editing?.imageUrl && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setEditing({ ...editing, imageUrl: null })}>Remove image</button>}
            <label className="form-check-label"><input className="form-check-input" type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active</label>
            <div className="modal-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
          </form>
        </>}
      </Modal>
    </>
  );
}
