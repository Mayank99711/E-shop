import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { customerApi } from "../../../services/customer/index.js";
import {
  PageState,
  PageHeading,
  SignInPrompt,
} from "../../../components/customer/StorefrontComponents.jsx";
import { CartItems } from "../../../components/customer/CartItems.jsx";
import { CartSummary } from "../../../components/customer/CartSummary.jsx";
import { CartCouponOffers } from "../../../components/customer/CartCouponOffers.jsx";
import { CartRecommendations } from "../../../components/customer/CartRecommendations.jsx";
import Modal from "../../../components/common/Modal.jsx";

export function CartPage({ signedIn, onCartChange, onNotice }) {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [razorpayBusy, setRazorpayBusy] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [addressForm, setAddressForm] = useState({ label: "Home", recipient: "", mobile: "", line1: "", line2: "", city: "", region: "", postalCode: "", country: "India", isDefault: false });
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [checkoutKey, setCheckoutKey] = useState(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [availableOffers, setAvailableOffers] = useState([]);
  const [offersBusy, setOffersBusy] = useState(false);
  const [offersError, setOffersError] = useState("");
  useEffect(() => {
    if (document.getElementById("razorpay-script")) return;
    const script = document.createElement("script");
    script.id = "razorpay-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    customerApi.addresses().then((result) => {
      const items = Array.isArray(result?.items) ? result.items : Array.isArray(result) ? result : [];
      setAddresses(items);
      if (items.length) setAddressId(items.find((a) => a.isDefault)?.id || items[0].id);
    }).catch((requestError) => setError(requestError.message));
  }, [signedIn]);
  useEffect(() => {
    if (!signedIn || !addressId || !cart?.items?.length) { setQuote(null); setQuoteError(""); return; }
    let active = true;
    setQuoteLoading(true);
    customerApi.checkoutQuote(addressId, couponCode).then((result) => { if (active) { setQuote(result); setQuoteError(""); } })
      .catch((requestError) => { if (active) { setQuote(null); setQuoteError(requestError.message); } })
      .finally(() => { if (active) setQuoteLoading(false); });
    return () => { active = false; };
  }, [signedIn, addressId, cart, couponCode]);
  useEffect(() => {
    let active = true;
    customerApi.cart().then(({ cart: result }) => { if (active) setCart(result); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!signedIn || !cart?.items?.length) { setAvailableOffers([]); return; }
    let active = true;
    setOffersBusy(true);
    customerApi.availableCartCoupons()
      .then(response => { if (active) { setAvailableOffers((response.items || []).map(item => ({ ...item, shopName: response.shopName }))); setOffersError(response.notice || ""); } })
      .catch(error => { if (active) { setAvailableOffers([]); setOffersError(error.message || "Unable to load coupons"); } })
      .finally(() => { if (active) setOffersBusy(false); });
    return () => { active = false; };
  }, [signedIn, cart]);

  function applyVisibleCoupon(code) {
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) return;
    setCouponInput(normalized);
    setCouponCode(normalized);
    setCheckoutKey(null);
  }

  function removeVisibleCoupon() {
    setCouponInput("");
    setCouponCode("");
    setCheckoutKey(null);
  }

  async function update(item, quantity) {
    setBusy(true);
    setError("");
    try {
      if (quantity < 1) await customerApi.removeCartItem(item.id);
      else await customerApi.updateCartItem(item.id, quantity);
      const { cart: nextCart } = await customerApi.cart();
      setCart(nextCart);
      onCartChange(nextCart.items.reduce((sum, entry) => sum + entry.quantity, 0));
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function openAddressModal(address = null) {
    setAddressError("");
    if (address) {
      setEditingAddress(address);
      setAddressForm({ label: address.label || "Home", recipient: address.recipient || "", mobile: address.mobile || "", line1: address.line1 || "", line2: address.line2 || "", city: address.city || "", region: address.region || "", postalCode: address.postalCode || "", country: address.country || "India", isDefault: Boolean(address.isDefault) });
    } else {
      setEditingAddress(null);
      setAddressForm({ label: "Home", recipient: "", mobile: "", line1: "", line2: "", city: "", region: "", postalCode: "", country: "India", isDefault: false });
    }
    setAddressModalOpen(true);
  }

  async function saveAddress(event) {
    event.preventDefault();
    setAddressBusy(true);
    setAddressError("");
    try {
      const payload = { ...addressForm, line2: addressForm.line2?.trim() ? addressForm.line2.trim() : null };
      const result = editingAddress
        ? await customerApi.updateAddress(editingAddress.id, payload)
        : await customerApi.createAddress(payload);
      const saved = result.address || result;
      const refreshed = await customerApi.addresses();
      const items = refreshed.items || refreshed || [];
      setAddresses(items);
      if (saved?.id) setAddressId(saved.id);
      setAddressModalOpen(false);
    } catch (requestError) {
      setAddressError(requestError.message);
    } finally {
      setAddressBusy(false);
    }
  }

  async function checkout() {
    if (!addressId) { onNotice("Select a shipping address."); return; }
    const key = checkoutKey || crypto.randomUUID();
    setCheckoutKey(key);
    setBusy(true);
    try {
      const result = await customerApi.checkout({ addressId, idempotencyKey: key, ...(couponCode ? { couponCode } : {}) });
      onNotice(`Order created: ${result.order.orderNumber || result.order.id}`);
      setCheckoutKey(null);
      setCouponCode(""); setCouponInput("");
      const { cart: nextCart } = await customerApi.cart();
      setCart(nextCart);
      onCartChange(nextCart.items.reduce((sum, entry) => sum + entry.quantity, 0));
    } catch (requestError) {
      onNotice(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function ensureRazorpayScript() {
    if (window.Razorpay) return true;
    if (!document.getElementById("razorpay-script")) {
      const script = document.createElement("script");
      script.id = "razorpay-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);
    }
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (window.Razorpay) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return Boolean(window.Razorpay);
  }

  async function refreshCartAfterVerifiedPayment(orderNumber) {
    setCheckoutKey(null);
    setCouponCode(""); setCouponInput("");
    onNotice(`Payment verified successfully. Order: ${orderNumber}`);
    try {
      const { cart: nextCart } = await customerApi.cart();
      setCart(nextCart);
      onCartChange(nextCart.items.reduce((sum, entry) => sum + entry.quantity, 0));
    } catch (requestError) {
      onNotice(`Payment verified successfully. Order: ${orderNumber}. Cart refresh failed: ${requestError.message}`);
    }
  }

  async function payWithRazorpay() {
    if (!addressId) { onNotice("Select a shipping address."); return; }
    if (!(await ensureRazorpayScript())) {
      onNotice("Razorpay Checkout could not be loaded. Check your network connection and try again.");
      return;
    }
    const key = checkoutKey || crypto.randomUUID();
    setCheckoutKey(key);
    setRazorpayBusy(true);
    try {
      const result = await customerApi.checkoutRazorpay({ addressId, idempotencyKey: key, ...(couponCode ? { couponCode } : {}) });
      const orderNumber = result.order.orderNumber || result.order.id;
      const localPaymentStatus = result.order.payments?.[0]?.status || "PENDING";
      if (result.replayed && localPaymentStatus === "PAID") {
        await refreshCartAfterVerifiedPayment(orderNumber);
        return;
      }
      const checkoutNotice = localPaymentStatus === "PENDING"
        ? `Order created: ${orderNumber}. Payment pending; complete Razorpay Checkout to verify it.`
        : localPaymentStatus === "FAILED"
          ? `Order created: ${orderNumber}. The previous payment attempt failed; retry using this existing order.`
          : `Order created: ${orderNumber}. Payment ${localPaymentStatus.toLowerCase()}; the order is not confirmed until payment verification completes.`;
      onNotice(checkoutNotice);
      if (!result.keyId || !result.razorpayOrderId || !result.amount) {
        throw new Error("Razorpay payment details are incomplete.");
      }
      const options = {
        key: result.keyId,
        amount: result.amount,
        currency: result.currency || "INR",
        name: "E-Shop",
        order_id: result.razorpayOrderId,
        handler: async (response) => {
          try {
            const verified = await customerApi.verifyRazorpayPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            });
            if (verified.payment.status === "PAID") {
              await refreshCartAfterVerifiedPayment(verified.order.orderNumber || verified.order.id);
            } else if (verified.payment.status === "FAILED") {
              onNotice(`Order created: ${orderNumber}. Payment failed; the order remains unconfirmed.`);
            } else {
              onNotice(`Order created: ${orderNumber}. Payment ${verified.payment.status.toLowerCase()}; order confirmation is pending.`);
            }
          } catch (e) {
            onNotice(`Order created: ${orderNumber}. Payment verification could not be completed; the order remains unconfirmed. ${e.message || ""}`.trim());
          } finally {
            setRazorpayBusy(false);
          }
        },
        modal: { ondismiss: () => setRazorpayBusy(false) }
      };
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response) => {
        const reason = response?.error?.description;
        onNotice(`Order created: ${orderNumber}. Razorpay reported a payment failure; the order remains unconfirmed.${reason ? ` ${reason}` : ""}`);
        setRazorpayBusy(false);
      });
      rzp.open();
    } catch (requestError) {
      onNotice(requestError.code === "RAZORPAY_NOT_CONFIGURED" ? "Razorpay test payments are currently unavailable." : (requestError.message || "Unable to start Razorpay payment."));
      setRazorpayBusy(false);
    }
  }

  if (!signedIn) return <SignInPrompt title="Your shopping cart" />;
  const subtotal = cart?.items.reduce((sum, item) => {
    const unitPrice = Number(item.variant.discountPrice || item.variant.price);
    return sum + unitPrice * item.quantity;
  }, 0) || 0;
  return <section className="account-page">
    <PageHeading eyebrow="READY WHEN YOU ARE" title="Your cart" description="Review quantities and current availability before checkout." />
    {error && <div className="store-alert" role="alert">{error}</div>}
    <PageState loading={loading}>
      {!cart?.items.length
        ? <div className="store-empty"><span>Your cart is empty</span><p>Discover something special in the marketplace.</p><Link className="btn btn-primary" to="/">Explore products</Link></div>
        :
         <>
    <div className="cart-layout">
      <div className="cart-products-and-coupons">
        <CartItems
          items={cart.items}
          busy={busy}
          update={update}
        />
        <CartCouponOffers
          offers={availableOffers}
          loading={offersBusy}
          error={offersError}
          couponInput={couponInput}
          setCouponInput={setCouponInput}
          couponCode={couponCode}
          quote={quote}
          quoteError={quoteError}
          quoteLoading={quoteLoading}
          onApply={applyVisibleCoupon}
          onRemove={removeVisibleCoupon}
        />
      </div>

      <CartSummary
        couponInput={couponInput}
        setCouponInput={setCouponInput}
        couponCode={couponCode}
        setCouponCode={code => { setCouponCode(code); setCheckoutKey(null); }}
        subtotal={subtotal}
        quote={quote}
        quoteError={quoteError}
        quoteLoading={quoteLoading}
        addresses={addresses}
        addressId={addressId}
        setAddressId={setAddressId}
        busy={busy}
        razorpayBusy={razorpayBusy}
        onCheckout={checkout}
        onRazorpay={payWithRazorpay}
        onManageAddresses={() => openAddressModal()}
      />
    </div>

    <CartRecommendations cartItems={cart.items} />
  </>}
    </PageState>
    <Modal open={addressModalOpen} title={editingAddress ? "Edit address" : "Add address"} onClose={() => setAddressModalOpen(false)}>
      {addressError && <div className="store-alert" role="alert">{addressError}</div>}
      <div className="address-list">
        {addresses.map((address) => (
          <div className="address-card" key={address.id}>
            <div><strong>{address.recipient}</strong><p>{address.line1} {address.line2 && (" " + address.line2)}<br />{address.city}, {address.region} {address.postalCode}</p></div>
            <div className="address-actions">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => { setAddressId(address.id); setAddressModalOpen(false); }}>Use</button>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openAddressModal(address)}>Edit</button>
            </div>
          </div>
        ))}
      </div>
      <form className="address-form" onSubmit={saveAddress}>
        <label>Label<input className="form-control" value={addressForm.label} onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })} required /></label>
        <label>Recipient<input className="form-control" value={addressForm.recipient} onChange={(e) => setAddressForm({ ...addressForm, recipient: e.target.value })} required /></label>
        <label>Mobile<input className="form-control" value={addressForm.mobile} onChange={(e) => setAddressForm({ ...addressForm, mobile: e.target.value })} required /></label>
        <label>Address line 1<input className="form-control" value={addressForm.line1} onChange={(e) => setAddressForm({ ...addressForm, line1: e.target.value })} required /></label>
        <label>Address line 2<input className="form-control" value={addressForm.line2} onChange={(e) => setAddressForm({ ...addressForm, line2: e.target.value })} /></label>
        <div className="address-fields">
          <label>City<input className="form-control" value={addressForm.city} onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })} required /></label>
          <label>State/Region<input className="form-control" value={addressForm.region} onChange={(e) => setAddressForm({ ...addressForm, region: e.target.value })} required /></label>
          <label>Postal code<input className="form-control" value={addressForm.postalCode} onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })} required /></label>
          <label>Country<input className="form-control" value={addressForm.country} onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })} required /></label>
        </div>
        <label className="check-label"><input type="checkbox" checked={addressForm.isDefault} onChange={(e) => setAddressForm({ ...addressForm, isDefault: e.target.checked })} /> Default address</label>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setAddressModalOpen(false)} disabled={addressBusy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={addressBusy}>{addressBusy ? "Saving..." : (editingAddress ? "Save changes" : "Save address")}</button>
        </div>
      </form>
    </Modal>
  </section>;
}
