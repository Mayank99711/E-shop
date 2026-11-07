import { useEffect, useState } from 'react';
import { customerApi } from '../../../services/customer/index.js';
import { PageState, PageHeading, SignInPrompt } from '../../../components/customer/StorefrontComponents.jsx';

export function AddressesPage({ signedIn }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  useEffect(() => {
    let active = true;
    customerApi.addresses().then(({ items: result }) => { if (active) setItems(result); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function saveAddress(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries(form.entries());
    body.isDefault = form.has("isDefault");
    try {
      const { address } = editingAddress
        ? await customerApi.updateAddress(editingAddress.id, body)
        : await customerApi.createAddress(body);
      setItems((current) => editingAddress
        ? current.map((item) => ({
          ...(body.isDefault ? { ...item, isDefault: item.id === address.id } : item),
          ...(item.id === address.id ? address : {})
        }))
        : [address, ...current.map((item) => body.isDefault ? { ...item, isDefault: false } : item)]);
      formElement.reset();
      setEditingAddress(null);
      setNotice(editingAddress ? "Address updated." : "Address saved.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  function editAddress(item) {
    setEditingAddress(item);
    setError("");
    setNotice("");
  }
  function cancelAddressEdit() {
    setEditingAddress(null);
    setError("");
  }
  async function removeAddress(id) {
    setBusy(true); setError(""); setNotice("");
    try {
      await customerApi.removeAddress(id);
      setItems((current) => current.filter((item) => item.id !== id));
      if (editingAddress?.id === id) setEditingAddress(null);
      setNotice("Address removed.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  async function setDefault(item) {
    setBusy(true); setError(""); setNotice("");
    try {
      const { address } = await customerApi.updateAddress(item.id, { isDefault: true });
      setItems((current) => current.map((entry) => ({ ...entry, isDefault: entry.id === address.id })));
      setNotice("Default address updated.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  if (!signedIn) return <SignInPrompt title="Saved addresses" />;
  return <section className="account-page"><PageHeading eyebrow="DELIVERY DETAILS" title="My addresses" description="Manage addresses saved to your customer account." />
    {error && <div className="store-alert" role="alert">{error}</div>}{notice && <div className="store-alert success" role="status">{notice}</div>}
    <div className="address-layout"><PageState loading={loading}><div className="address-list">{items.length ? items.map((item) => <article className="address-card" key={item.id}>
      <div><strong>{item.label}</strong>{item.isDefault && <span className="default-tag">Default</span>}</div><p>{item.recipient} · {item.mobile}<br />{item.line1}{item.line2 ? `, ${item.line2}` : ""}<br />{item.city}, {item.region} {item.postalCode}<br />{item.country}</p>
      <div className="address-actions">{!item.isDefault && <button className="btn btn-sm btn-outline-primary" type="button" disabled={busy} onClick={() => setDefault(item)}>Set default</button>}<button className="btn btn-sm btn-outline-primary" type="button" disabled={busy} onClick={() => editAddress(item)}>Edit</button><button className="btn btn-sm btn-outline-danger" type="button" disabled={busy} onClick={() => removeAddress(item.id)}>Remove</button></div>
    </article>) : <div className="store-empty">No saved addresses yet.</div>}</div></PageState>
      <form className="address-form" key={editingAddress?.id || "new-address"} onSubmit={saveAddress}><h2>{editingAddress ? "Edit address" : "Add an address"}</h2>
        <label>Label<input name="label" required maxLength="40" placeholder="Home, Work…" defaultValue={editingAddress?.label || ""} /></label><label>Recipient<input name="recipient" required minLength="2" maxLength="100" defaultValue={editingAddress?.recipient || ""} /></label><label>Mobile<input name="mobile" required minLength="7" maxLength="20" defaultValue={editingAddress?.mobile || ""} /></label><label>Address line 1<input name="line1" required minLength="3" maxLength="200" defaultValue={editingAddress?.line1 || ""} /></label><label>Address line 2<input name="line2" maxLength="200" defaultValue={editingAddress?.line2 || ""} /></label>
        <div className="address-fields"><label>City<input name="city" required minLength="2" maxLength="100" defaultValue={editingAddress?.city || ""} /></label><label>State / region<input name="region" required minLength="2" maxLength="100" defaultValue={editingAddress?.region || ""} /></label></div><div className="address-fields"><label>Postal code<input name="postalCode" required minLength="3" maxLength="20" defaultValue={editingAddress?.postalCode || ""} /></label><label>Country<input name="country" required defaultValue={editingAddress?.country || "India"} maxLength="80" /></label></div><label className="check-label"><input name="isDefault" type="checkbox" defaultChecked={editingAddress?.isDefault || false} /> Make this my default address</label><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : editingAddress ? "Update address" : "Save address"}</button>{editingAddress && <button className="btn btn-outline-secondary" type="button" disabled={busy} onClick={cancelAddressEdit}>Cancel</button>}
      </form>
    </div>
  </section>;
}
