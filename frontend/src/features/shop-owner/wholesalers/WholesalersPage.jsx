import { useEffect, useMemo, useState } from "react";
import { shopOwnerApi } from "../../../services/shopOwner/index.js";
import { PurchaseOrdersSection } from "../purchase-orders/PurchaseOrdersPage.jsx";
import { UploadBillsSection } from "../../../components/shopOwner/UploadBillsSection.jsx";
import { PaymentHistorySection } from "../../../components/shopOwner/PaymentHistorySection.jsx";

const initialForm = { code: "", name: "", contactName: "", email: "", phone: "" };
const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value || 0));
export function OwnerWholesalers() {
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState("");
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);
    try {
      const [w, po, b] = await Promise.all([shopOwnerApi.wholesalers(), shopOwnerApi.purchaseOrders(), shopOwnerApi.wholesaleBills()]);
      setItems(w.items || []); setOrders(po.items || []); setBills(b.items || []);
      setError("");
    } catch(e) { setError(e.message || "Unable to load wholesalers"); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);
  const visible = useMemo(()=>items.filter(w =>
    (filter === "ALL" || w.status === filter) && [w.name,w.code,w.email,w.phone].some(v => String(v || "").toLowerCase().includes(search.toLowerCase()))
  ),[items,filter,search]);
  const openOrders = orders.filter(po=>["DRAFT","SUBMITTED","PARTIALLY_RECEIVED"].includes(po.status));
  const outstanding = bills.filter(b=>b.status!=="CANCELLED").reduce((sum,b)=>sum+Math.round(Number(b.outstandingAmount||0)*100),0)/100;
  const selectedOrders = orders.filter(po=>po.wholesalerId===selected?.id);
  const selectedBills = bills.filter(b=>b.wholesalerId===selected?.id);
  function show(w,mode){setSelected(w);setAction(mode);setNotice("");setError("");}
  function close(){setAction("");setSelected(null);load();}
  function openEditWholesaler(w){setSelected(w);setForm({code:w.code,name:w.name,contactName:w.contactName||"",email:w.email||"",phone:w.phone||""});setAction("edit");setError("");setNotice("");}
  async function toggleWholesalerStatus(w){if(busy)return;const on=w.status!=="ACTIVE";if(!window.confirm(`Change ${w.name} to ${on?"ACTIVE":"INACTIVE"}?`))return;setBusy(true);setError("");try{await shopOwnerApi.setWholesalerStatus(w.id,on);await load();setNotice(`Wholesaler is now ${on?"ACTIVE":"INACTIVE"}.`);}catch(e){setError(e.message||"Status update failed");}finally{setBusy(false);}}
  async function saveWholesalerEdit(e){e.preventDefault();if(busy)return;setBusy(true);setError("");try{await shopOwnerApi.updateWholesalerDetails(selected.id,{name:form.name,contactName:form.contactName,email:form.email,phone:form.phone});setAction("");setSelected(null);await load();setNotice("Wholesaler details updated.");}catch(e){setError(e.message||"Update failed");}finally{setBusy(false);}}
  async function register(e){
    e.preventDefault();if(busy)return;setBusy(true);setError("");
    try{await shopOwnerApi.registerWholesaler({code:form.code.trim(),name:form.name.trim(),...(form.contactName.trim()?{contactName:form.contactName.trim()}:{}),...(form.email.trim()?{email:form.email.trim()}:{}),...(form.phone.trim()?{phone:form.phone.trim()}:{})});setNotice("Wholesaler registered for your shop.");setForm(initialForm);setAction("");await load();}
    catch(e){setError(e.message||"Registration failed");}finally{setBusy(false);}
  }
  return <div className="container-fluid py-3">
    <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4"><div><h3 className="fw-bold mb-1">Manage Wholesalers</h3><p className="text-muted">Supplier records and their purchase orders, bills and payments in one table.</p></div><button type="button" className="btn btn-primary" onClick={()=>{setForm(initialForm);setAction("add");setError("")}}>+ Add Wholesaler</button></div>
    {error && <div role="alert" className="alert alert-danger">{error}</div>}{notice && <div role="status" className="alert alert-success">{notice}</div>}
    <div className="row g-3 mb-4">{[["Total Wholesalers",items.length],["Active Wholesalers",items.filter(w=>w.status==="ACTIVE").length],["Open Purchase Orders",openOrders.length],["Outstanding Payments",money(outstanding)]].map(([label,value])=><div className="col-sm-6 col-xl-3" key={label}><div className="card shadow-sm h-100"><div className="card-body"><div className="text-muted small">{label}</div><h3 className="fw-bold">{loading?"—":value}</h3></div></div></div>)}</div>
    <section className="card shadow-sm border-0"><div className="card-body"><div className="d-flex gap-2 flex-wrap mb-3"><input aria-label="Search wholesalers" className="form-control" style={{maxWidth:340}} placeholder="Search name or code" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter status" className="form-select" style={{maxWidth:185}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><button className="btn btn-outline-secondary" disabled={loading} onClick={load}>Refresh</button></div>
    {loading?<p>Loading wholesalers...</p>:<div className="table-responsive"><table className="table table-hover align-middle"><thead className="table-light"><tr><th>Code</th><th>Wholesaler</th><th>Contact</th><th>Status</th><th>Open POs</th><th>Outstanding</th><th>Actions</th></tr></thead><tbody>{visible.map(w=><tr key={w.id}><td>{w.code}</td><td><strong>{w.name}</strong></td><td>{w.contactName||w.email||w.phone||"—"}</td><td><button type="button" className={`btn btn-sm ${w.status==="ACTIVE"?"btn-outline-success":"btn-outline-secondary"}`} onClick={()=>toggleWholesalerStatus(w)} disabled={busy} title="Click to change status">{w.status}</button></td><td>{openOrders.filter(po=>po.wholesalerId===w.id).length}</td><td>{money(bills.filter(b=>b.wholesalerId===w.id&&b.status!=="CANCELLED").reduce((sum,b)=>sum+Number(b.outstandingAmount||0),0))}</td><td><div className="d-flex gap-2"><button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>openEditWholesaler(w)}>Edit</button><button type="button" className="btn btn-sm btn-outline-secondary" onClick={()=>show(w,"actions")}>More Actions</button></div></td></tr>)}{visible.length===0&&<tr><td className="text-center py-4" colSpan={7}>No wholesalers found</td></tr>}</tbody></table></div>}</div></section>
    {action && <div style={{position:"fixed",inset:0,zIndex:1100,background:"rgba(15,23,42,.65)",display:"grid",placeItems:"center",padding:12}}><div role="dialog" aria-modal="true" aria-label={action==="add"?"Add Wholesaler":"Wholesaler operations"} className="card shadow-lg" style={{width:"min(1050px,100%)",maxHeight:"94vh",overflow:"auto"}}><div className="card-header bg-white d-flex justify-content-between align-items-center"><h4 className="mb-0">{action==="add"?"Add Wholesaler":`${selected?.name} — ${action==="actions"?"Actions":action}`}</h4><button type="button" className="btn-close" aria-label="Close" onClick={close} disabled={busy}/></div><div className="card-body">
    {error&&<div className="alert alert-danger">{error}</div>}
    {action==="add"&&<form onSubmit={register} className="row g-3"><div className="col-md-6"><label className="form-label">Wholesaler Name *</label><input className="form-control" required minLength={2} maxLength={120} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div><div className="col-md-6"><label className="form-label">Unique Code *</label><input className="form-control" required minLength={2} maxLength={40} value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value}))}/></div>{[["contactName","Contact Name"],["email","Email"],["phone","Phone"]].map(([k,label])=><div className="col-md-6" key={k}><label className="form-label">{label}</label><input className="form-control" type={k==="email"?"email":"text"} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/></div>)}<div className="col-12"><p className="text-muted small">Existing supplier codes cannot be registered twice. Ask Super Admin to assign an existing supplier.</p><button className="btn btn-primary" disabled={busy}>{busy?"Saving...":"Save Wholesaler"}</button></div></form>}
    {action==="edit"&&<form onSubmit={saveWholesalerEdit} className="row g-3"><div className="col-md-6"><label className="form-label">Wholesaler Name *</label><input className="form-control" required minLength={2} maxLength={120} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div><div className="col-md-6"><label className="form-label">Code (read only)</label><input className="form-control" value={form.code} disabled/></div>{[["contactName","Contact Name"],["email","Email"],["phone","Phone"]].map(([k,label])=><div key={k} className="col-md-6"><label className="form-label">{label}</label><input type={k==="email"?"email":"text"} className="form-control" value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/></div>)}<div className="col-12"><button type="submit" className="btn btn-primary" disabled={busy}>{busy?"Saving...":"Save Changes"}</button></div></form>}
     {action==="actions"&&<div className="d-grid gap-2">{[["details","View Wholesaler Details"],["Purchase Orders","Purchase Orders & Goods Receipts"],["Upload Bills","Upload Bills"],["Payment History","Payment History & Record Payment"]].map(([id,label])=><button key={id} className="btn btn-outline-primary text-start" onClick={()=>setAction(id)}>{label}</button>)}</div>}
    {action==="details"&&<dl><dt>Code</dt><dd>{selected.code}</dd><dt>Name</dt><dd>{selected.name}</dd><dt>Contact</dt><dd>{selected.contactName||"—"}</dd><dt>Email</dt><dd>{selected.email||"—"}</dd><dt>Phone</dt><dd>{selected.phone||"—"}</dd><dt>Status</dt><dd>{selected.status} (shop owner cannot change shared supplier status)</dd></dl>}
    {action==="Purchase Orders"&&<><p className="text-muted">{selectedOrders.length} orders for this wholesaler</p><PurchaseOrdersSection wholesalerId={selected.id}/></>}
    {action==="Upload Bills"&&<><p className="text-muted">{selectedBills.length} bills for this wholesaler</p><UploadBillsSection wholesalerId={selected.id}/></>}
    {action==="Payment History"&&<PaymentHistorySection wholesalerId={selected.id}/>}
    </div><div className="card-footer bg-white d-flex justify-content-between"><div>{selected&&action!=="actions"&&<button type="button" className="btn btn-outline-primary" onClick={()=>setAction("actions")}>Back to Actions</button>}</div><button type="button" className="btn btn-outline-secondary" onClick={close} disabled={busy}>Close</button></div></div></div>}
  </div>;
}
