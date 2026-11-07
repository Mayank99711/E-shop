import { useEffect, useState } from 'react';
import { shopOwnerApi, resolveMediaUrl } from '../../services/shopOwner/index.js';

export function OwnerShopProfile({ shop, submit }) {
  const [profile, setProfile] = useState({
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
  useEffect(() => {
    setProfile({
      businessName: shop.businessName || "", businessType: shop.businessType || "",
      taxId: shop.taxId || "", gstNumber: shop.gstNumber || "", panNumber: shop.panNumber || "",
      pinCode: shop.pinCode || "", city: shop.city || "", district: shop.district || "",
      state: shop.state || "", country: shop.country || "", businessAddress: shop.businessAddress || "",
      contactPhone: shop.contactPhone || "", contactEmail: shop.contactEmail || "", logoUrl: shop.logoUrl || ""
    });
  }, [shop]);
  async function save(event) {
    event.preventDefault();
    const result = await submit(
      () => shopOwnerApi.updateShopProfile(profile),
      "Shop business profile updated."
    );
    if (result?.shop) setProfile((current) => Object.fromEntries(Object.keys(current).map((key) => [key, result.shop[key] || ""])));
  }
  return <section className="workspace-card">
    <h2>Shop Profile</h2>
    <p className="muted-copy">Keep your business contact and legal details up to date.</p>
    {profile.logoUrl && <img className="shop-logo-preview" src={resolveMediaUrl(profile.logoUrl)} alt="Shop logo preview" />}
    <form className="workspace-form" onSubmit={save}>
      <label>Legal Business Name<input className="form-control" maxLength="160" value={profile.businessName} onChange={(event) => setProfile({ ...profile, businessName: event.target.value })} /></label>
      <label>Business Type<input className="form-control" maxLength="100" value={profile.businessType} onChange={(event) => setProfile({ ...profile, businessType: event.target.value })} /></label>
      <label>GST Number<input className="form-control" maxLength="15" value={profile.gstNumber} onChange={(event) => setProfile({ ...profile, gstNumber: event.target.value.toUpperCase() })} /></label>
      <label>PAN<input className="form-control" maxLength="10" value={profile.panNumber} onChange={(event) => setProfile({ ...profile, panNumber: event.target.value.toUpperCase() })} /></label>
      <div className="form-row">
        <label>PIN Code<input className="form-control" maxLength="20" value={profile.pinCode} onChange={(event) => setProfile({ ...profile, pinCode: event.target.value })} /></label>
        <label>City<input className="form-control" maxLength="100" value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} /></label>
        <label>District<input className="form-control" maxLength="100" value={profile.district} onChange={(event) => setProfile({ ...profile, district: event.target.value })} /></label>
        <label>State<input className="form-control" maxLength="100" value={profile.state} onChange={(event) => setProfile({ ...profile, state: event.target.value })} /></label>
        <label>Country<input className="form-control" maxLength="100" value={profile.country} onChange={(event) => setProfile({ ...profile, country: event.target.value })} /></label>
      </div>
      <label>Shop Address<textarea className="form-control" maxLength="500" rows="3" value={profile.businessAddress} onChange={(event) => setProfile({ ...profile, businessAddress: event.target.value })} /></label>
      <div className="form-row">
        <label>Contact Phone<input className="form-control" type="tel" minLength="7" maxLength="20" value={profile.contactPhone} onChange={(event) => setProfile({ ...profile, contactPhone: event.target.value })} /></label>
        <label>Contact Email<input className="form-control" type="email" maxLength="254" value={profile.contactEmail} onChange={(event) => setProfile({ ...profile, contactEmail: event.target.value })} /></label>
      </div>
      <label>Shop Logo URL<input className="form-control" type="url" maxLength="2048" value={profile.logoUrl} onChange={(event) => setProfile({ ...profile, logoUrl: event.target.value })} /></label>
      <button className="btn btn-primary">Save Shop Profile</button>
    </form>
  </section>;
}
