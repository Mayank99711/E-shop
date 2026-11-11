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
import { useAuth } from "../../../context/AuthContext.jsx";
import { money } from "../../../utils/format.js";

const CONFIRMATION_KEY = "eshop_last_order_confirmation";
const CONFIRMATION_TTL_MS = 30 * 60 * 1000;

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
  const { user } = useAuth();
  const [orderConfirmation, setOrderConfirmation] = useState(null);

  // Restore only a recent confirmation belonging to the signed-in customer.
  useEffect(() => {
    if (!signedIn || !user?.id) {
      setOrderConfirmation(null);
      return;
    }

    try {
      const saved = JSON.parse(sessionStorage.getItem(CONFIRMATION_KEY) || "null");
      const isValid =
        saved?.userId === String(user.id) &&
        saved?.confirmation?.orderNumber &&
        Number.isFinite(saved?.savedAt) &&
        Date.now() >= saved.savedAt &&
        Date.now() - saved.savedAt <= CONFIRMATION_TTL_MS;

      if (isValid) {
        setOrderConfirmation(saved.confirmation);
      } else {
        sessionStorage.removeItem(CONFIRMATION_KEY);
        setOrderConfirmation(null);
      }
    } catch {
      // Storage may be unavailable in private browsing or blocked environments.
      setOrderConfirmation(null);
    }
  }, [signedIn, user?.id]);

  function clearOrderConfirmation() {
    setOrderConfirmation(null);
    try {
      sessionStorage.removeItem(CONFIRMATION_KEY);
    } catch {
      // No persistence is available; React state has still been cleared.
    }
  }

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
  function showOrderConfirmation(order, paymentMethod) {
    const selectedAddress = addresses.find((address) => address.id === addressId);
    const orderedItems = (cart?.items || []).map((item) => {
      const unitPrice = Number(item.variant.discountPrice || item.variant.price);
      return {
        id: item.id,
        name: item.product.name,
        sku: item.variant.sku,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
      };
    });
    const fallbackSubtotal = orderedItems.reduce((sum, item) => sum + item.lineTotal, 0);

    // Never infer the payable amount from product prices alone: tax, shipping,
    // and discounts may apply. A verified Razorpay replay can have an empty cart.
    const confirmation = {
      orderNumber: order.orderNumber || order.id,
      customerName: user?.name || "Customer",
      paymentMethod,
      paymentStatus: paymentMethod === "COD" ? "Pay on Delivery" : "Payment Successful",
      subtotal: quote?.subtotal != null ? Number(quote.subtotal) : (orderedItems.length ? fallbackSubtotal : null),
      gst: quote?.taxTotal == null ? null : Number(quote.taxTotal),
      deliveryCharges: quote?.deliveryTotal == null ? null : Number(quote.deliveryTotal),
      discount: Number(quote?.discountTotal || 0),
      total: quote?.grandTotal == null ? null : Number(quote.grandTotal),
      items: orderedItems,
      address: selectedAddress ? { ...selectedAddress } : null,
    };

    setOrderConfirmation(confirmation);
    if (user?.id) {
      try {
        sessionStorage.setItem(
          CONFIRMATION_KEY,
          JSON.stringify({ userId: String(user.id), savedAt: Date.now(), confirmation })
        );
      } catch {
        // Order is still displayed even when browser storage is unavailable.
      }
    }
  }

  async function checkout() {
    if (!addressId) { onNotice("Select a shipping address."); return; }
    const key = checkoutKey || crypto.randomUUID();
    setCheckoutKey(key);
    setBusy(true);
    try {
      const result = await customerApi.checkout({
  addressId,
  idempotencyKey: key,
  ...(couponCode ? { couponCode } : {}),
});

showOrderConfirmation(result.order, "COD");
onNotice("");

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
    onNotice("");
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
  showOrderConfirmation(result.order, "RAZORPAY");
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
  showOrderConfirmation(verified.order, "RAZORPAY");

  await refreshCartAfterVerifiedPayment(
    verified.order.orderNumber || verified.order.id
  );
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
  if (orderConfirmation) {
  const confirmation = orderConfirmation;

  return (
    <section className="account-page">
      <div className="order-success-page">
        <div className="order-success-icon" aria-hidden="true">
          ✓
        </div>

        <h1>Thank You for Your Order!</h1>

        <p className="order-success-subtitle">
          Thank you, {confirmation.customerName}! Your order has
          been confirmed.
        </p>

        <div className="order-success-details">
          <div>
            <span>Order Number</span>
            <strong>{confirmation.orderNumber}</strong>
          </div>

          <div>
            <span>Payment Method</span>
            <strong>
              {confirmation.paymentMethod === "COD"
                ? "Cash on Delivery"
                : "Razorpay"}
            </strong>
          </div>

          <div>
            <span>Payment Status</span>
            <strong>{confirmation.paymentStatus}</strong>
          </div>

          <div>
            <span>Order Total</span>
            <strong>{confirmation.total == null ? "See My Orders" : money(confirmation.total)}</strong>
          </div>
        </div>
        <div className="order-success-section">
  <h2>Payment Summary</h2>

  <div className="order-success-price-breakdown">
    <div>
      <span>Subtotal</span>
      <strong>{confirmation.subtotal == null ? "See My Orders" : money(confirmation.subtotal)}</strong>
    </div>

    {confirmation.gst !== null && (
      <div>
        <span>GST (as quoted)</span>
        <strong>{money(confirmation.gst)}</strong>
      </div>
    )}

    {confirmation.discount > 0 && (
      <div className="order-success-discount">
        <span>Coupon Discount</span>
        <strong>-{money(confirmation.discount)}</strong>
      </div>
    )}

    {confirmation.deliveryCharges !== null && (
      <div>
        <span>Delivery Charges</span>
        <strong>
          {confirmation.deliveryCharges === 0
            ? "FREE"
            : money(confirmation.deliveryCharges)}
        </strong>
      </div>
    )}

    <div className="order-success-grand-total">
      <span>Total Payable</span>
      <strong>{confirmation.total == null ? "See My Orders" : money(confirmation.total)}</strong>
    </div>
  </div>
</div>
        <div className="order-success-section">
          <h2>Ordered Products</h2>

          {confirmation.items.length === 0 && (
            <p>Product details are available in My Orders.</p>
          )}
          {confirmation.items.map((item) => (
            <div className="order-success-item" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <small>
                  SKU: {item.sku} · Quantity: {item.quantity}
                </small>
              </div>

              <strong>{money(item.lineTotal)}</strong>
            </div>
          ))}
        </div>

        {confirmation.address && (
          <div className="order-success-section">
            <h2>Delivery Address</h2>

            <p className="order-success-address">
              <strong>{confirmation.address.recipient}</strong>
              <span>{confirmation.address.line1}</span>

              {confirmation.address.line2 && (
                <span>{confirmation.address.line2}</span>
              )}

              <span>
                {confirmation.address.city},{" "}
                {confirmation.address.region}{" "}
                {confirmation.address.postalCode}
              </span>

              {confirmation.address.mobile && (
                <span>
                  Mobile: {confirmation.address.mobile}
                </span>
              )}
            </p>
          </div>
        )}

        <div className="order-success-actions">
          <Link
            className="btn order-success-primary-btn"
            to="/my-orders"
            onClick={clearOrderConfirmation}
          >
            View My Orders
          </Link>

          <Link
            className="btn order-success-secondary-btn"
            to="/"
            onClick={clearOrderConfirmation}
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </section>
  );
}
  const subtotal = cart?.items.reduce((sum, item) => {
    const unitPrice = Number(item.variant.discountPrice || item.variant.price);
    return sum + unitPrice * item.quantity;
  }, 0) || 0;
  return <section className="account-page customer-cart-page">
    <PageHeading eyebrow="READY WHEN YOU ARE" title="Your cart" description="Review quantities and current availability before checkout." />
    {error && <div className="store-alert" role="alert">{error}</div>}
    <PageState loading={loading}>
      {!cart?.items.length
        ?
<div className="store-empty customer-cart-empty">
  <div className="customer-cart-empty-icon" aria-hidden="true">
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 7h12l1.5 13h-15L6 7Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </svg>
  </div>

  <h2>Your cart is empty</h2>

  <p>
    Looks like you haven't added anything yet.
    Explore our collection and find something you love.
  </p>

  <Link className="btn btn-primary customer-cart-explore-btn" to="/">
    Explore Products
    <span aria-hidden="true">→</span>
  </Link>
</div>

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
