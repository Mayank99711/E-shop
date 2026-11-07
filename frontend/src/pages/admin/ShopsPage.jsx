import { useState, useEffect } from "react";
import { adminApi } from '../../services/admin/index.js';
import { apiRequest } from '../../services/apiClient.js';
import Modal from '../../components/common/Modal.jsx';
import { Notice, FieldError } from '../../components/admin/WorkspaceFeedback.jsx';

export function ShopManagement({ items, onReload, loading = false }) {
  const emptyShopForm = {
    shopName: "", shopCategoryId: "", commissionPercentage: "", businessName: "", businessType: "", taxId: "", gstNumber: "", panNumber: "",
    pinCode: "", city: "", district: "", state: "", country: "India", businessAddress: "",
    contactPhone: "", contactEmail: "", status: "PENDING", logoUrl: "",
    ownerFirstName: "", ownerLastName: "", ownerEmail: "", ownerMobile: ""
  };
  const [form, setForm] = useState(emptyShopForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState("");
  const [statusChangingId, setStatusChangingId] = useState("");
  const [editing, setEditing] = useState(null);
  const [shopSearch, setShopSearch] = useState("");
  const [shopStatus, setShopStatus] = useState("");
  const [shopPage, setShopPage] = useState(1);
  const shopPageSize = 10;

  useEffect(() => {
    if ((!createOpen && !editing) || categories.length) return;
    let active = true;
    setLoadingCategories(true);
    apiRequest("/api/admin/shop-categories")
      .then((categoryItems) => { if (active) setCategories((categoryItems.items || categoryItems || []).filter((category) => category.isActive)); })
      .catch((requestError) => { if (active) setError(`Could not load shop categories: ${requestError.message}`); })
      .finally(() => { if (active) setLoadingCategories(false); });
    return () => { active = false; };
  }, [createOpen, Boolean(editing), categories.length]);

  async function createShop(event) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    setNotice("");
    setBusy(true);
    try {
      const { ownerMobile, ...shopDetails } = form;
      const result = await adminApi.createShop({ ...shopDetails, ...(ownerMobile.trim() ? { ownerMobile: ownerMobile.trim() } : {}) });
      setNotice(result.message);
      setForm(emptyShopForm);
      setCreateOpen(false);
      onReload();
    } catch (requestError) {
      setError(requestError.message);
      setFieldErrors(Object.fromEntries((requestError.details || []).map(({ field, message }) => [field, message])));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(shopId, status) {
    if (statusChangingId) return;
    if (status === "INACTIVE" && !window.confirm("Deactivate this shop?")) return;
    setStatusChangingId(shopId);
    setError("");
    setNotice("");
    try {
      await adminApi.setShopStatus(shopId, status);
      setNotice(`Shop status changed to ${status.toLowerCase().replace("_", " ")}.`);
      onReload();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setStatusChangingId("");
    }
  }

  function editShop(shop) {
    setEditing({
      id: shop.id,
      name: shop.name,
      shopCategoryId: shop.shopCategoryId || "",
      commissionPercentage: shop.commissionPercentage ?? "",
      businessName: shop.businessName || "",
      businessType: shop.businessType || "",
      taxId: shop.taxId || "",
      gstNumber: shop.gstNumber || "",
      panNumber: shop.panNumber || "",
      pinCode: shop.pinCode || "",
      city: shop.city || "",
      district: shop.district || "",
      state: shop.state || "",
      country: shop.country || "",
      businessAddress: shop.businessAddress || "",
      contactPhone: shop.contactPhone || "",
      contactEmail: shop.contactEmail || "",
      logoUrl: shop.logoUrl || ""
    });
  }

  async function resendActivation(shop) {
    setError("");
    setNotice("");
    setResending(shop.id);
    try {
      const result = await adminApi.resendShopActivation(shop.id);
      setNotice(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setResending("");
    }
  }

  async function saveShop(event) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    setNotice("");
    setBusy(true);
    try {
      const { id, ...shopDetails } = editing;
      await adminApi.updateShop(id, { ...shopDetails, shopCategoryId: shopDetails.shopCategoryId || null });
      setEditing(null);
      setNotice("Shop details updated.");
      onReload();
    } catch (requestError) {
      setError(requestError.message);
      setFieldErrors(Object.fromEntries((requestError.details || []).map(({ field, message }) => [field, message])));
    } finally {
      setBusy(false);
    }
  }

  const filteredShops = items.filter((shop) => {
    const search = shopSearch.trim().toLowerCase();
    const matchesSearch = !search || [shop.name, shop.code, shop.owner.name, shop.owner.email]
      .some((value) => value.toLowerCase().includes(search));
    return matchesSearch && (!shopStatus || shop.status === shopStatus);
  });
  const pageCount = Math.ceil(filteredShops.length / shopPageSize);
  const visibleShops = filteredShops.slice((shopPage - 1) * shopPageSize, shopPage * shopPageSize);
  useEffect(() => {
    const lastPage = Math.max(1, pageCount);
    if (shopPage > lastPage) setShopPage(lastPage);
  }, [pageCount, shopPage]);

  return (
    <>
      <Notice error={error} notice={notice} />
      <section className="workspace-card">
        <div className="workspace-card-heading">
          <div><h3>Shops & owners</h3><p>Activation and archival preserve historical orders.</p></div>
          <div className="page-actions">
            <button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={onReload}>{"\u21BB"}</button>
            <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>+ Create shop & invite owner</button>
          </div>
        </div>
        <div className="shop-list-meta"><span className="record-count">{visibleShops.length} of {filteredShops.length} records shown</span></div>
        <div className="shop-filters"><input className="form-control" type="search" aria-label="Search shops and owners" placeholder="Search shops or owners" value={shopSearch} onChange={(event) => { setShopSearch(event.target.value); setShopPage(1); }} /><select className="form-select" aria-label="Filter shops by status" value={shopStatus} onChange={(event) => { setShopStatus(event.target.value); setShopPage(1); }}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select></div>
        {!items.length ? <div className="empty-state">No shops have been created yet.</div> : !visibleShops.length ? <div className="empty-state">No shops match these filters.</div> : (
          <div className="table-responsive"><table className="table align-middle workspace-table" aria-label="Shops and owners"><thead><tr><th scope="col">Shop</th><th scope="col">Owner</th><th scope="col">Account</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>
            {visibleShops.map((shop) => <tr key={shop.id}>
              <td><strong>{shop.name}</strong><small>{shop.code}</small></td>
              <td>{shop.owner.name}<small>{shop.owner.email}</small></td>
              <td>{shop.owner.isActive ? "Activated" : "Invitation pending"}</td>
              <td>{shop.status === "ACTIVE" || shop.status === "INACTIVE" ? <button type="button" className={`status-pill ${shop.status.toLowerCase()} status-toggle`} disabled={statusChangingId === shop.id} aria-label={`${statusChangingId === shop.id ? "Saving" : shop.status === "ACTIVE" ? "Deactivate" : "Activate"} ${shop.name}`} onClick={() => changeStatus(shop.id, shop.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>{statusChangingId === shop.id ? "Saving..." : shop.status}</button> : <span className={`status-pill ${shop.status.toLowerCase()}`}>{shop.status}</span>}</td>
              <td className="row-actions">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => editShop(shop)}>Edit</button>
                {!shop.owner.isActive && shop.status !== "ARCHIVED" && <button className="btn btn-sm btn-outline-primary" disabled={resending === shop.id} onClick={() => resendActivation(shop)}>{resending === shop.id ? "Sending..." : "Resend invite"}</button>}
                {shop.status !== "ARCHIVED" && <button className="btn btn-sm btn-outline-danger" onClick={() => changeStatus(shop.id, "ARCHIVED")}>Archive</button>}
              </td>
            </tr>)}
          </tbody></table></div>
        )}
        {pageCount > 1 && <nav className="shop-pagination" aria-label="Shops pagination">
          <button className="btn btn-sm btn-outline-secondary" type="button" disabled={shopPage === 1} onClick={() => setShopPage((page) => page - 1)}>Previous</button>
          <span aria-live="polite">Page {shopPage} of {pageCount}</span>
          <button className="btn btn-sm btn-outline-secondary" type="button" disabled={shopPage === pageCount} onClick={() => setShopPage((page) => page + 1)}>Next</button>
        </nav>}
      </section>
      <Modal open={createOpen} title="Create shop and invite owner" className="shop-create-modal" onClose={() => setCreateOpen(false)}>
        <Notice error={error} />
        <form className="workspace-form shop-form" onSubmit={createShop}>
          <div className="shop-form-columns">
            <div className="form-section">
              <h3>Shop Details</h3>
              <label>Shop Name <b className="required-star">*</b><input className="form-control" required minLength="2" maxLength="120" placeholder="Example: Northstar Home" value={form.shopName} onChange={(event) => setForm({ ...form, shopName: event.target.value })} /><FieldError errors={fieldErrors} field="shopName" /></label>
              <label>Shop Category <b className="required-star">*</b><select className="form-select" required disabled={loadingCategories} value={form.shopCategoryId} onChange={(event) => setForm({ ...form, shopCategoryId: event.target.value })}><option value="">{loadingCategories ? "Loading categories..." : "Select shop category"}</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select><FieldError errors={fieldErrors} field="shopCategoryId" /></label>
              <label>Commission Percentage (%)<input className="form-control" type="number" min="0" max="100" step="0.01" placeholder="Leave blank if unconfigured" value={form.commissionPercentage} onChange={(event) => setForm({ ...form, commissionPercentage: event.target.value })} /><FieldError errors={fieldErrors} field="commissionPercentage" /></label>
              <label>GST Number<input className="form-control" maxLength="15" placeholder="15-character GSTIN (if applicable)" value={form.gstNumber} onChange={(event) => setForm({ ...form, gstNumber: event.target.value.toUpperCase() })} /><FieldError errors={fieldErrors} field="gstNumber" /></label>
              <label>Shop Contact Phone<input className="form-control" type="tel" minLength="7" maxLength="20" value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} /><FieldError errors={fieldErrors} field="contactPhone" /></label>
              <label>Shop Contact Email<input className="form-control" type="email" maxLength="254" value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} /><FieldError errors={fieldErrors} field="contactEmail" /></label>
              <label>Shop Address <b className="required-star">*</b><textarea className="form-control" required minLength="2" maxLength="500" rows="3" placeholder="Street address and locality" value={form.businessAddress} onChange={(event) => setForm({ ...form, businessAddress: event.target.value })} /><FieldError errors={fieldErrors} field="businessAddress" /></label>
              <label>City<input className="form-control" maxLength="100" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
              <label>District<input className="form-control" maxLength="100" value={form.district} onChange={(event) => setForm({ ...form, district: event.target.value })} /></label>
              <label>State<input className="form-control" maxLength="100" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></label>
              <label>PIN Code<input className="form-control" maxLength="20" value={form.pinCode} onChange={(event) => setForm({ ...form, pinCode: event.target.value })} /></label>
              <label>Shop Status<select className="form-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="PENDING">Pending activation</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
              <div></div>
            </div>
            <div className="form-section">
              <h3>Additional Business Information</h3>
              <label>Legal Business Name<input className="form-control" maxLength="160" placeholder="Registered legal name" value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label>
              <label>Business Type<input className="form-control" maxLength="100" placeholder="Sole proprietorship, partnership, etc." value={form.businessType} onChange={(event) => setForm({ ...form, businessType: event.target.value })} /></label>
              <label>PAN<input className="form-control" maxLength="10" placeholder="PAN (if applicable)" value={form.panNumber} onChange={(event) => setForm({ ...form, panNumber: event.target.value.toUpperCase() })} /><FieldError errors={fieldErrors} field="panNumber" /></label>
              <label>Other Tax ID<input className="form-control" maxLength="100" placeholder="Other tax identifier, if applicable" value={form.taxId} onChange={(event) => setForm({ ...form, taxId: event.target.value })} /></label>
              <label>Country <b className="required-star">*</b><input className="form-control" required maxLength="100" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></label>
              <label>Shop Logo URL<input className="form-control" type="url" maxLength="2048" placeholder="https://�" value={form.logoUrl} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} /><FieldError errors={fieldErrors} field="logoUrl" /></label>
            </div>
            <div className="form-section">
              <h3>Owner Details</h3>
              <label>Owner First Name <b className="required-star">*</b><input className="form-control" required minLength="1" maxLength="50" value={form.ownerFirstName} onChange={(event) => setForm({ ...form, ownerFirstName: event.target.value })} /><FieldError errors={fieldErrors} field="ownerFirstName" /></label>
              <label>Owner Last Name <b className="required-star">*</b><input className="form-control" required minLength="1" maxLength="50" value={form.ownerLastName} onChange={(event) => setForm({ ...form, ownerLastName: event.target.value })} /></label>
              <label>Owner Email <b className="required-star">*</b><input className="form-control" type="email" required maxLength="254" value={form.ownerEmail} onChange={(event) => setForm({ ...form, ownerEmail: event.target.value })} /><FieldError errors={fieldErrors} field="ownerEmail" /></label>
              <label>Owner Phone (optional)<input className="form-control" type="tel" maxLength="20" value={form.ownerMobile} onChange={(event) => setForm({ ...form, ownerMobile: event.target.value })} /><FieldError errors={fieldErrors} field="ownerMobile" /></label>
            </div>
          </div>
          <div className="modal-actions"><button className="btn btn-outline-secondary" type="button" disabled={busy} onClick={() => setCreateOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy || loadingCategories || !categories.length}>{busy ? "Creating shop..." : "Create Shop & Owner"}</button></div>
        </form>
      </Modal>
      <Modal open={Boolean(editing)} title="Edit shop and business profile" onClose={() => !busy && setEditing(null)}>
        {editing && <><Notice error={error} /><form className="workspace-form" onSubmit={saveShop}>
          <label>Shop name<input className="form-control" required minLength="2" maxLength="120" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
          <label>Shop category<select className="form-select" disabled={loadingCategories} value={editing.shopCategoryId} onChange={(event) => setEditing({ ...editing, shopCategoryId: event.target.value })}><option value="">No category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}{!category.isActive ? " (inactive)" : ""}</option>)}{editing.shopCategoryId && !categories.some(({ id }) => id === editing.shopCategoryId) && <option value={editing.shopCategoryId}>Current category</option>}</select><FieldError errors={fieldErrors} field="shopCategoryId" /></label>
          <label>Commission Percentage (%)<input className="form-control" type="number" min="0" max="100" step="0.01" placeholder="Leave blank if unconfigured" value={editing.commissionPercentage ?? ""} onChange={(event) => setEditing({ ...editing, commissionPercentage: event.target.value })} /><FieldError errors={fieldErrors} field="commissionPercentage" /></label>
          <label>Business name<input className="form-control" maxLength="160" value={editing.businessName} onChange={(event) => setEditing({ ...editing, businessName: event.target.value })} /></label>
          <label>Business type<input className="form-control" maxLength="100" value={editing.businessType} onChange={(event) => setEditing({ ...editing, businessType: event.target.value })} /></label>
          <label>Other Tax ID<input className="form-control" maxLength="100" value={editing.taxId} onChange={(event) => setEditing({ ...editing, taxId: event.target.value })} /></label>
          <label>GST Number<input className="form-control" maxLength="15" value={editing.gstNumber || ""} onChange={(event) => setEditing({ ...editing, gstNumber: event.target.value.toUpperCase() })} /></label>
          <label>PAN<input className="form-control" maxLength="10" value={editing.panNumber || ""} onChange={(event) => setEditing({ ...editing, panNumber: event.target.value.toUpperCase() })} /></label>
          <div className="form-row">
            <label>PIN Code<input className="form-control" maxLength="20" value={editing.pinCode} onChange={(event) => setEditing({ ...editing, pinCode: event.target.value })} /></label>
            <label>City<input className="form-control" maxLength="100" value={editing.city} onChange={(event) => setEditing({ ...editing, city: event.target.value })} /></label>
            <label>District<input className="form-control" maxLength="100" value={editing.district} onChange={(event) => setEditing({ ...editing, district: event.target.value })} /></label>
            <label>State<input className="form-control" maxLength="100" value={editing.state} onChange={(event) => setEditing({ ...editing, state: event.target.value })} /></label>
            <label>Country<input className="form-control" maxLength="100" value={editing.country} onChange={(event) => setEditing({ ...editing, country: event.target.value })} /></label>
          </div>
          <label>Business address<textarea className="form-control" maxLength="500" rows="2" value={editing.businessAddress} onChange={(event) => setEditing({ ...editing, businessAddress: event.target.value })} /></label>
          <div className="form-row">
            <label>Contact phone<input className="form-control" type="tel" maxLength="20" value={editing.contactPhone} onChange={(event) => setEditing({ ...editing, contactPhone: event.target.value })} /><FieldError errors={fieldErrors} field="contactPhone" /></label>
            <label>Contact email<input className="form-control" type="email" maxLength="254" value={editing.contactEmail} onChange={(event) => setEditing({ ...editing, contactEmail: event.target.value })} /><FieldError errors={fieldErrors} field="contactEmail" /></label>
          </div>
          <label>Logo URL<input className="form-control" type="url" maxLength="2048" value={editing.logoUrl} onChange={(event) => setEditing({ ...editing, logoUrl: event.target.value })} /></label>
          <div className="modal-actions"><button className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
        </form></>}
      </Modal>
    </>
  );
}
