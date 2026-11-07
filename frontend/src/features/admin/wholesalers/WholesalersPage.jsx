import { useEffect, useMemo, useState } from "react";
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
          <td><div className="dropdown"><button className="btn btn-sm btn-outline-primary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" onClick={()=>open(w,"actions")}>Actions</button></div></td></tr>)}
        {filtered.length===0 && <tr><td colSpan="6" className="text-center py-4">No matching wholesalers</td></tr>}
      </tbody></table></div>}
    </section>}
    <section id="shop-wholesaler-access" className="workspace-card"><h3>Shop–Wholesaler Access</h3><label>Select shop<select className="form-select" value={selectedShop} onChange={e=>{setSelectedShop(e.target.value);loadAssignments(e.target.value)}}><option value="">Select a shop</option>{shops.map(shop=><option value={shop.id} key={shop.id}>{shop.name}</option>)}</select></label>
      {selectedShop && <ShopWholesalerAuthorization items={items} assignments={assignments} busy={busy} onAssign={id=>changeAccess(id,"assign")} onRevoke={id=>changeAccess(id,"revoke")}/>}
    </section>
    {modal && selected && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"grid",placeItems:"center",zIndex:1100,padding:15}}><div className="workspace-card" role="dialog" aria-modal="true" aria-label="Wholesaler actions" style={{width:"min(590px,100%)",maxHeight:"90vh",overflow:"auto"}}>
      <div className="d-flex justify-content-between align-items-center mb-3"><h3 className="mb-0">{modal==="status"?"Confirm Status Change":modal==="edit"?"Edit Wholesaler":`Actions — ${selected.name}`}</h3><button type="button" className="btn-close" onClick={()=>setModal("")} aria-label="Close"/></div>
      {modal==="actions" && <div className="d-grid gap-2"><button className="btn btn-outline-primary" onClick={()=>setModal("view")}>View Details</button><button className="btn btn-outline-primary" onClick={()=>setModal("edit")}>Edit Details</button><button className="btn btn-outline-primary" onClick={()=>{setModal("");document.getElementById("shop-wholesaler-access")?.scrollIntoView({behavior:"smooth"})}}>Manage Shop Access (below)</button></div>}
      {modal==="view" && <dl><dt>Code</dt><dd>{selected.code}</dd><dt>Name</dt><dd>{selected.name}</dd><dt>Contact</dt><dd>{selected.contactName || "—"}</dd><dt>Email</dt><dd>{selected.email || "—"}</dd><dt>Phone</dt><dd>{selected.phone || "—"}</dd><dt>Status</dt><dd>{selected.status}</dd></dl>}
      {modal==="edit" && <form onSubmit={e=>{e.preventDefault();save("edit")}} className="workspace-form">{[["code","Code"],["name","Name"],["contactName","Contact Name"],["email","Email"],["phone","Phone"]].map(([field,label])=><label key={field}>{label}<input className="form-control" required={field==="code"||field==="name"} value={form[field]||""} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}/></label>)}<button className="btn btn-primary" disabled={busy}>Save Changes</button></form>}
      {modal==="status" && <><p>Change <strong>{selected.name}</strong> from <strong>{selected.status}</strong> to <strong>{selected.status==="ACTIVE"?"INACTIVE":"ACTIVE"}</strong>?</p><p className="text-muted small">This may affect shop access. No change occurs until confirmation.</p><button className="btn btn-primary" disabled={busy} onClick={()=>save("status")}>Confirm Status Change</button></>}
      <button type="button" className="btn btn-outline-secondary ms-2 mt-2" onClick={()=>setModal("")} disabled={busy}>Close / Cancel</button>
    </div></div>}
  </div>;
}
