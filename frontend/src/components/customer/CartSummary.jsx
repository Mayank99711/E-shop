import { useState } from 'react';
import { money } from '../../utils/format.js';

export function CartSummary({ subtotal, quote, quoteError, quoteLoading, addresses, addressId, setAddressId, busy, razorpayBusy, onCheckout, onRazorpay, onManageAddresses, couponInput, setCouponInput, couponCode, setCouponCode }) {
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const selectedAddress = addresses.find((a) => a.id === addressId);
  const hasQuote = Boolean(quote) && !quoteError;
  const displaySubtotal = hasQuote ? quote.subtotal : subtotal;
  const gst = hasQuote ? quote.taxTotal : null;
  const shipping = hasQuote ? quote.deliveryTotal : null;
  const total = hasQuote ? quote.grandTotal : null;
  return (
    <aside className="cart-summary">
      <h2>Order summary</h2>
      <p><span>Subtotal</span><strong>{money(displaySubtotal)}</strong></p>
      {hasQuote ? (
        <>
          <p>
            <span>GST
              <small>(Included in subtotal)</small></span>
            <strong>{money(gst)}</strong>
          </p>
          <p className="delivery-fee-line"><span>Delivery Charges</span><strong>{shipping === 0 ? 'Free' : money(shipping)}</strong></p>
          {hasQuote && Number(quote.discountTotal || 0) > 0 &&
            <p className="cart-summary-savings"><span>Coupon savings{quote.couponCode ? ' (' + quote.couponCode + ')' : ''}</span><strong>-{money(quote.discountTotal)}</strong></p>}
          {hasQuote && Number(quote.discountTotal || 0) > 0 &&
            <div className="cart-summary-saved-note" role="status">✓ You saved {money(quote.discountTotal)} with your coupon!</div>}
          <div className="summary-total"><span>Total payable</span><strong>{money(total)}</strong></div>
        </>
      ) : quoteError ? (
        <p className="store-alert" role="alert">Unable to calculate total: {quoteError}</p>
      ) : (
        <p className="muted-copy">Totals will be calculated after selecting a valid address.</p>
      )}
      {quoteLoading && <small>Calculating quote...</small>}
      <div className="delivery-address-section">
  <div className="delivery-address-header">
    <div>
      <h3>Delivery Address</h3>
      <p>Select an address for your order</p>
    </div>

    <button
  type="button"
  className="btn btn-sm delivery-add-address-btn"
  onClick={onManageAddresses}
  disabled={busy || razorpayBusy}
>
  + Add Address
</button>
  </div>

  {addresses.length > 0 ? (
    <fieldset className="delivery-address-options">
      <legend className="visually-hidden">
        Choose delivery address
      </legend>

      {addresses.map((address) => (
        <label
          key={address.id}
          className={`delivery-address-option ${
            addressId === address.id ? "selected" : ""
          }`}
        >
          <input
            type="radio"
            name="deliveryAddress"
            value={address.id}
            checked={addressId === address.id}
            onChange={() => setAddressId(address.id)}
            disabled={busy || razorpayBusy}
          />

          <div className="delivery-address-content">
            <div className="delivery-address-title">
              <strong>{address.label || "Address"}</strong>

              {address.isDefault && (
                <span className="delivery-default-badge">
                  Default
                </span>
              )}
            </div>

            <strong>{address.recipient}</strong>

            <p>
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ""}
              <br />
              {address.city}, {address.region}{" "}
              {address.postalCode}
            </p>

            {address.mobile && (
              <small>Mobile: {address.mobile}</small>
            )}
          </div>
        </label>
      ))}
    </fieldset>
  ) : (
    <div className="delivery-address-empty">
      No saved addresses yet. Add an address to continue.
    </div>
  )}

  {selectedAddress && (
    <p className="delivery-address-confirmation">
      ✓ Delivery address selected
    </p>
  )}
</div>
      <fieldset className="payment-methods">
        <legend>Payment method</legend>
        <label><input type="radio" name="paymentMethod" value="cod" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} /> Cash on Delivery</label>
        <label><input type="radio" name="paymentMethod" value="razorpay" checked={paymentMethod === 'razorpay'} onChange={() => setPaymentMethod('razorpay')} /> Razorpay</label>
      </fieldset>
      <button
  className="btn w-100 cart-place-order-btn"
  type="button"
  disabled={
    busy ||
    razorpayBusy ||
    !addressId ||
    !quote ||
    quoteLoading ||
    !!quoteError
  }
  onClick={paymentMethod === "cod" ? onCheckout : onRazorpay}
>
  {razorpayBusy
    ? "Starting payment..."
    : paymentMethod === "cod"
      ? "Place COD Order"
      : "Pay Securely with Razorpay"}
</button>
      <small>{paymentMethod === 'cod' ? 'Cash on Delivery. Stock is reserved only after server confirmation.' : 'Razorpay Checkout opens in a secure popup. Payment is verified by the server.'}</small>
    </aside>
  );
}
