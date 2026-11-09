import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { adminApi } from "../../../services/admin/index.js";
import { Notice } from "../../../components/admin/WorkspaceFeedback.jsx";
import { ShopWholesalerAuthorization } from "../../../components/admin/ShopWholesalerAuthorization.jsx";

export function WholesalerManagement({ accessOnly = false }) {
  const [items, setItems] = useState([]);
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState("");
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [wholesalers, shopResult] = await Promise.all([adminApi.wholesalers(), adminApi.shops()]);
      setItems(wholesalers.items || []);
      setShops(shopResult.items || []);
      setError("");
    } catch (e) { setError(e.message || "Unable to load wholesalers"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => items.filter(w =>
    (statusFilter === "ALL" || w.status === statusFilter) &&
    [w.name, w.code, w.email, w.phone, w.contactName].some(value => String(value || "").toLowerCase().includes(search.toLowerCase()))
  ), [items, search, statusFilter]);
  function open(item, action) {
    setOpenDropdownId(null);
    setSelected(item);
    setForm({ name: item.name, code: item.code, contactName: item.contactName || "", email: item.email || "", phone: item.phone || "" });
    setError(""); setModal(action);
  }
  async function save(operation) {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      if (operation === "status") {
        const next = selected.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
        await adminApi.updateWholesaler(selected.id, { status: next });
        setNotice(`Wholesaler status changed to ${next}.`);
      } else {
        await adminApi.updateWholesaler(selected.id, {
          code: form.code.trim(), name: form.name.trim(),
          contactName: form.contactName.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null
        });
        setNotice("Wholesaler details updated.");
      }
      setModal(""); await load();
    } catch (e) { setError(e.message || "Update failed"); }
    finally { setBusy(false); }
  }
  async function loadAssignments(shopId) {
    if (!shopId) { setAssignments([]); return; }
    try { const result = await adminApi.shopWholesalers(shopId); setAssignments(result.items || []); }
    catch(e) { setError(e.message); }
  }
  async function changeAccess(wholesalerId, mode) {
    if (!selectedShop || busy) return;
    if (mode === "assign" && !window.confirm(`Grant ${selected?.name || "this wholesaler"} access to the selected shop?`)) return;
    if (mode === "revoke" && !window.confirm("Revoke this shop's wholesaler access?")) return;
    setBusy(true); setError("");
    try {
      if (mode === "assign") await adminApi.assignShopWholesaler(selectedShop, wholesalerId);
      else await adminApi.revokeShopWholesaler(selectedShop, wholesalerId);
      setNotice(mode === "assign" ? "Shop access granted." : "Shop access revoked.");
      await loadAssignments(selectedShop);
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div>
    <Notice error={error} notice={notice}/>
    {!accessOnly && <section className="workspace-card">
      <div className="workspace-card-heading"><div><h3>Wholesaler Management</h3><p>Manage existing wholesalers. New wholesalers are registered by shop owners.</p></div></div>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <input className="form-control" style={{maxWidth:340}} aria-label="Search wholesalers" placeholder="Search name, code, contact..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="form-select" style={{maxWidth:190}} aria-label="Filter wholesaler status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All statuses</option><option>ACTIVE</option><option>INACTIVE</option><option>ARCHIVED</option></select>
        <button type="button" className="btn btn-outline-secondary" onClick={load} disabled={loading}>Refresh</button>
      </div>
      {loading ? <p>Loading wholesalers...</p> : <div className="table-responsive"><table className="table table-hover align-middle workspace-table"><thead><tr><th>Code</th><th>Name</th><th>Contact</th><th>Email / Phone</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {filtered.map(w => <tr key={w.id}><td>{w.code}</td><td>{w.name}</td><td>{w.contactName || "—"}</td><td>{w.email || "—"}<br/><small>{w.phone || ""}</small></td>
          <td><button type="button" className={`status-pill status-toggle ${w.status === "ACTIVE" ? "active" : "inactive"}`} onClick={()=>open(w,"status")} title="Change status (confirmation required)">{w.status}</button></td>
          <td>
  <button
    type="button"
    className="btn btn-sm btn-outline-primary dropdown-toggle"
    aria-expanded={openDropdownId === w.id}
    onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const menuWidth = 230;
      const menuHeight = 155;

      setMenuPosition({
        left: Math.max(
          12,
          Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12)
        ),
        top: rect.bottom + menuHeight + 8 < window.innerHeight
          ? rect.bottom + 6
          : Math.max(12, rect.top - menuHeight - 6),
      });

      setOpenDropdownId(current => current === w.id ? null : w.id);
    }}
  >
    Actions
  </button>
</td></tr>)}
        {filtered.length===0 && <tr><td colSpan="6" className="text-center py-4">No matching wholesalers</td></tr>}
      </tbody></table></div>}
    </section>}
    {openDropdownId && items.some(w => w.id === openDropdownId) &&
      createPortal(
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1199,
              background: "transparent",
            }}
            onClick={() => setOpenDropdownId(null)}
          />

          <div
            className="dropdown-menu show shadow-sm"
            role="menu"
            style={{
              position: "fixed",
              top: menuPosition.top,
              left: menuPosition.left,
              width: 230,
              zIndex: 1200,
              borderRadius: 10,
              padding: "6px",
            }}
          >
            <button
              type="button"
              className="dropdown-item rounded"
              onClick={() => {
                const item = items.find(w => w.id === openDropdownId);
                if (item) open(item, "view");
              }}
            >
              View Details
            </button>

            <button
              type="button"
              className="dropdown-item rounded"
              onClick={() => {
                const item = items.find(w => w.id === openDropdownId);
                if (item) open(item, "edit");
              }}
            >
              Edit Details
            </button>

            <hr className="dropdown-divider" />

            <button
              type="button"
              className="dropdown-item rounded"
              onClick={() => {
                const item = items.find(w => w.id === openDropdownId);
                if (item) {
                  open(item, "access");
                  setSelectedShop("");
                  setAssignments([]);
                }
              }}
            >
              Manage Shop Access
            </button>
          </div>
        </>,
        document.body
      )
    }
    {accessOnly && <section id="shop-wholesaler-access" className="workspace-card"><h3>Shop–Wholesaler Access</h3><label>Select shop<select className="form-select" value={selectedShop} onChange={e=>{setSelectedShop(e.target.value);loadAssignments(e.target.value)}}><option value="">Select a shop</option>{shops.map(shop=><option value={shop.id} key={shop.id}>{shop.name}</option>)}</select></label>
      {selectedShop && <ShopWholesalerAuthorization items={items} assignments={assignments} busy={busy} onAssign={id=>changeAccess(id,"assign")} onRevoke={id=>changeAccess(id,"revoke")}/>}
    </section>}
    {modal && selected && createPortal(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"grid",placeItems:"center",zIndex:1100,padding:15}}><div className="workspace-card" role="dialog" aria-modal="true" aria-label="Wholesaler actions" style={{width:"min(590px,100%)",maxHeight:"90vh",overflow:"auto"}}>
      <div className="d-flex justify-content-between align-items-center mb-3"><h3 className="mb-0">{modal==="status"?"Confirm Status Change":modal==="edit"?"Edit Wholesaler":modal==="access"?"Manage Shop Access":`Actions — ${selected.name}`}</h3><button type="button" className="btn-close" onClick={()=>setModal("")} aria-label="Close"/></div>

       {modal==="access" && <>
         <p className="text-muted mb-3">
           Manage shop authorization for <strong>{selected.name}</strong> ({selected.code}).
         </p>

         <label className="form-label w-100">
           Select Shop
           <select
             className="form-select mt-1"
             value={selectedShop}
             onChange={e => {
               setSelectedShop(e.target.value);
               loadAssignments(e.target.value);
             }}
           >
             <option value="">Choose a shop...</option>
             {shops.map(shop => (
               <option key={shop.id} value={shop.id}>{shop.name}</option>
             ))}
           </select>
         </label>

         {selectedShop && selected.status === "ACTIVE" && (
           <div className="mt-3">
             <h4 className="h6 mb-3">Shop Authorization</h4>
             <ShopWholesalerAuthorization
               items={[selected]}
               assignments={assignments}
               busy={busy}
               onAssign={id => changeAccess(id, "assign")}
               onRevoke={id => changeAccess(id, "revoke")}
             />
           </div>
         )}

         {selectedShop && selected.status !== "ACTIVE" && (
           <p className="text-muted mt-3">
             Only active wholesalers can be assigned to shops.
           </p>
         )}
       </>}
      {modal==="view" && <dl><dt>Code</dt><dd>{selected.code}</dd><dt>Name</dt><dd>{selected.name}</dd><dt>Contact</dt><dd>{selected.contactName || "—"}</dd><dt>Email</dt><dd>{selected.email || "—"}</dd><dt>Phone</dt><dd>{selected.phone || "—"}</dd><dt>Status</dt><dd>{selected.status}</dd></dl>}
      {modal==="edit" && <form onSubmit={e=>{e.preventDefault();save("edit")}} className="workspace-form">{[["code","Code"],["name","Name"],["contactName","Contact Name"],["email","Email"],["phone","Phone"]].map(([field,label])=><label key={field}>{label}<input className="form-control" required={field==="code"||field==="name"} value={form[field]||""} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}/></label>)}<button className="btn btn-primary" disabled={busy}>Save Changes</button></form>}
      {modal==="status" && <><p>Change <strong>{selected.name}</strong> from <strong>{selected.status}</strong> to <strong>{selected.status==="ACTIVE"?"INACTIVE":"ACTIVE"}</strong>?</p><p className="text-muted small">This may affect shop access. No change occurs until confirmation.</p><button className="btn btn-primary" disabled={busy} onClick={()=>save("status")}>Confirm Status Change</button></>}
      <button type="button" className="btn btn-outline-secondary d-block ms-auto mt-3" onClick={()=>setModal("")} disabled={busy}>Close / Cancel</button>
    </div></div>, document.body)}
  </div>;
}
