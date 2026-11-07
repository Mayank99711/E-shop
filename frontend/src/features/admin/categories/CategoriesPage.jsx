import { useMemo, useState, useEffect, useRef } from 'react';
import { adminApi } from '../../../services/admin/index.js';
import { resolveMediaUrl } from '../../../services/apiClient.js';
import Modal from '../../../components/common/Modal.jsx';
import { Notice, AdminPagination } from '../../../components/admin/WorkspaceFeedback.jsx';
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

export function CategoryManagement({ items, onReload, subcategoriesOnly = false, loading = false }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [formOpen, setFormOpen] = useState(false);
//   //for debugging purposes, log the formOpen state whenever it changes
//   useEffect(() => {
//   console.log("[CATEGORY-DEBUG] formOpen:", formOpen);
// }, [formOpen]);

// useEffect(() => {
//   console.log("[CATEGORY-DEBUG] Component mounted");

//   return () => {
//     console.log("[CATEGORY-DEBUG] Component cleanup");
//   };
// }, []);
  const [editingCategory, setEditingCategory] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState('');
  const imagePreview = useImagePreview(imageFile);
  const fileInputRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [togglingId, setTogglingId] = useState('');
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

  const visibleCategories = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (items ?? []).filter((category) => {
      const matchesType = subcategoriesOnly ? Boolean(category.parentId) : !category.parentId;
      const matchesSearch = category.name.toLowerCase().includes(search) || (category.parent?.name ?? '').toLowerCase().includes(search);
      const matchesStatus = statusFilter === 'ALL' || String(category.isActive) === statusFilter;
      return matchesType && matchesSearch && matchesStatus;
    });
  }, [items, query, statusFilter, subcategoriesOnly]);

  const pageCount = Math.max(1, Math.ceil(visibleCategories.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageCategories = visibleCategories.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function resetForm() {
    setName(''); setDescription(''); setParentId(''); setImageFile(null); setUploadedImageUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function openCreate() {
    resetForm(); setEditingCategory(null); setFormOpen(true); setError(''); setNotice('');
  }

  function editCategory(category) {
    setEditingCategory(category);
    setName(category.name);
    setDescription(category.description || '');
    setParentId(category.parentId || '');
    setImageFile(null);
    setUploadedImageUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFormOpen(true);
    setError(''); setNotice('');
  }

  function cancelEdit() {
    setEditingCategory(null); setFormOpen(false); resetForm(); setError('');
  }

  async function uploadImageIfNeeded(file) {
    if (!file) return null;
    return adminApi.uploadCategoryImage(file, 'categoryImage');
  }

  async function createCategory(event) {
    event.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      if (imageFile && !['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type)) {
        throw new Error('Choose a JPEG, PNG, or WebP image.');
      }
      if (imageFile && imageFile.size > 5 * 1024 * 1024) {
        throw new Error('Image must be 5 MB or smaller.');
      }
      let imageUrl = uploadedImageUrl;
      if (imageFile && !uploadedImageUrl) {
        imageUrl = await uploadImageIfNeeded(imageFile);
        setUploadedImageUrl(imageUrl);
      } else if (editingCategory?.imageUrl && !imageFile) {
        imageUrl = editingCategory.imageUrl;
      }
      const body = {
        name: name.trim(),
        ...(subcategoriesOnly && parentId ? { parentId } : {}),
        description: description.trim() || null,
        ...(imageUrl ? { imageUrl } : {})
      };
      if (editingCategory) await adminApi.updateCategory(editingCategory.id, body);
      else await adminApi.createCategory(body);
      setNotice(editingCategory ? 'Category updated.' : 'Category created.');
      cancelEdit();
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleCategory(category) {
    if (togglingId) return;
    setTogglingId(category.id); setError('');
    try {
      await adminApi.setCategoryStatus(category.id, !category.isActive);
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setTogglingId('');
    }
  }

  const hasMedia = (items ?? []).some((item) => item.iconUrl || item.imageUrl);

  const pendingRequests = (requests ?? []).filter((request) => request.status === 'PENDING' && request.type === 'CATEGORY' && (subcategoriesOnly ? Boolean(request.proposedData?.parentId) : !request.proposedData?.parentId));

  return (
    <>
      <Notice error={error} notice={notice} />
      <section className="workspace-card">
        <div className="workspace-card-heading">
          <div><h3>{subcategoriesOnly ? 'Manage Subcategories' : 'Manage Categories'}</h3><p>{subcategoriesOnly ? 'Review and maintain child categories under their approved parent.' : 'Create and organize top-level categories.'}</p></div>
          <div className="page-actions">
            <button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={onReload}>{'\u21BB'}</button>
            <button className="btn btn-outline-primary" type="button" onClick={() => setPendingOpen(true)}>Pending Approval ({pendingRequests.length})</button>
            <button className="btn btn-primary" type="button" onClick={openCreate}>+ Add {subcategoriesOnly ? 'subcategory' : 'category'}</button>
          </div>
        </div>
      </section>
      <section className="workspace-card">
        <div className="list-filters">
          <label>Search categories<input className="form-control" type="search" placeholder={subcategoriesOnly ? 'Search subcategory or parent' : 'Search category'} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
          <label>Status<select className="form-select" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="ALL">All</option><option value="true">Active</option><option value="false">Inactive</option></select></label>
          <span className="record-count">{visibleCategories.length} records</span>
        </div>
        {!(items ?? []).length ? <div className="empty-state">No categories have been created yet.</div> : !pageCategories.length ? <div className="empty-state">No categories match these filters.</div> : (
          <div className="table-responsive">
            <table className="table align-middle workspace-table" aria-label={subcategoriesOnly ? 'Subcategories' : 'Categories'}>
              <thead><tr>
                {hasMedia && <th scope="col">Media</th>}
                <th scope="col">Name</th>
                <th scope="col">Parent</th>
                <th scope="col">Description</th>
                <th scope="col">Products</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr></thead>
              <tbody>
                {pageCategories.map((item) => (
                  <tr key={item.id}>
                    {hasMedia && <td>{item.iconUrl && <img className="record-thumb" src={resolveMediaUrl(item.iconUrl)} alt="" />}{item.imageUrl && <img className="record-thumb" src={resolveMediaUrl(item.imageUrl)} alt="" />}</td>}
                    <td><strong>{item.name}</strong></td>
                    <td>{item.parent?.name || '—'}</td>
                    <td>{item.description || '—'}</td>
                    <td>{(item._count?.products ?? 0)}</td>
                    <td><button type="button" className={`status-pill ${item.isActive ? 'active' : 'inactive'} status-toggle`} disabled={togglingId === item.id} aria-label={`${togglingId === item.id ? 'Saving' : item.isActive ? 'Deactivate' : 'Reactivate'} ${item.name}`} onClick={() => toggleCategory(item)}>{togglingId === item.id ? 'Saving...' : item.isActive ? 'ACTIVE' : 'INACTIVE'}</button></td>
                    <td><div className="row-actions"><button className="btn btn-sm btn-outline-primary" type="button" onClick={() => editCategory(item)}>Edit</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination page={currentPage} pageCount={pageCount} onChange={setPage} />
      </section>
      <Modal open={formOpen} title={editingCategory ? `Edit ${subcategoriesOnly ? 'subcategory' : 'category'}` : `Add ${subcategoriesOnly ? 'subcategory' : 'category'}`} onClose={cancelEdit}>
        <Notice error={error} />
        <form className="workspace-form" onSubmit={createCategory}>
          {subcategoriesOnly && (
            <label>Parent category<select className="form-select" required value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">Select parent category</option>
              {(items ?? []).filter((item) => !item.parentId && (item.isActive || item.id === editingCategory?.parentId)).map((item) => <option key={item.id} value={item.id}>{item.name}{!item.isActive ? ' (inactive parent)' : ''}</option>)}
            </select></label>
          )}
          <label>{subcategoriesOnly ? 'Subcategory name' : 'Category name'}<input className="form-control" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Description<textarea className="form-control" rows="2" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>
            Image
            <input
              className="form-control"
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                console.log("[CATEGORY-DEBUG] File selected:", {
                    name: file?.name,
                    size: file?.size,
                    type: file?.type,
                  });

                setImageFile(file);
                setFormOpen(true);
                // A different file invalidates the URL uploaded for a previous selection.
                setUploadedImageUrl('');
              }}
            />
          </label>
          {imagePreview && (
            <img
              className="record-thumb"
              src={imagePreview}
              alt="Preview"
            />
          )}

          {!imagePreview && editingCategory?.imageUrl && (
            <img
              className="record-thumb"
              src={resolveMediaUrl(editingCategory.imageUrl)}
              alt="Current"
            />
          )}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : editingCategory ? 'Save changes' : `Add ${subcategoriesOnly ? 'subcategory' : 'category'}`}</button>
            <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={cancelEdit}>Cancel</button>
          </div>
        </form>
      </Modal>
      <PendingApprovalModal
        open={pendingOpen}
        onClose={() => setPendingOpen(false)}
        title={`Pending ${subcategoriesOnly ? 'Subcategory' : 'Category'} Approvals (${pendingRequests.length})`}
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
