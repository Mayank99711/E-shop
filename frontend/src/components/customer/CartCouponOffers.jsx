import { useState } from "react";
import { money } from "../../utils/format.js";

function offerLabel(offer) {
  const amount = Number(offer.discountValue || 0);
  return offer.discountType === "PERCENTAGE" ? `${amount}% OFF` : `${money(amount)} OFF`;
}

export function CartCouponOffers({ offers, loading, error, couponInput, setCouponInput, couponCode, onApply, onRemove, quote, quoteError, quoteLoading }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? offers : offers.slice(0, 3);
  const isApplied = Boolean(couponCode) && quote?.couponCode === couponCode;
  return (
    <div className="cart-coupon-column">
      <section className="cart-coupon-entry" aria-labelledby="coupon-entry-title">
        <div className="cart-coupon-title"><span className="coupon-icon" aria-hidden="true">✦</span><div><h2 id="coupon-entry-title">Have a coupon? Save on this order.</h2><p>Enter a code or choose an available offer below.</p></div></div>
        <form className="cart-coupon-form" onSubmit={event => { event.preventDefault(); onApply(couponInput); }}>
          <input aria-label="Coupon code" autoComplete="off" placeholder="Enter coupon code" maxLength={30} value={couponInput} onChange={event => setCouponInput(event.target.value.toUpperCase())}/>
          <button type="submit" disabled={!couponInput.trim() || quoteLoading}>Apply</button>
        </form>
        {couponCode && <div className="cart-coupon-applied" role="status"><span>{quoteError ? `Coupon ${couponCode} needs attention` : isApplied ? `✓ ${couponCode} applied` : `${couponCode} selected — validating...`}</span><button type="button" onClick={onRemove}>Remove</button></div>}
        {couponCode && quoteError && <div className="coupon-error" role="alert">{quoteError}</div>}
      </section>
      <section className="cart-coupon-offers" aria-labelledby="coupon-offers-title">
        <div className="cart-coupon-title"><span className="coupon-icon" aria-hidden="true">♧</span><div><h2 id="coupon-offers-title">Best offers for you</h2><p>{offers.length ? `Live coupons from ${offers[0]?.shopName || "this shop"}` : "Offers available for the products in your cart"}</p></div></div>
        {loading && <p className="coupon-muted" role="status">Checking the best offers for your cart...</p>}
        {error && <p className="coupon-error" role="alert">Unable to load offers: {error}</p>}
        {!loading && !error && !offers.length && <p className="coupon-muted">No active coupons available for this shop right now. You can still enter a coupon code above.</p>}
        <div className="cart-coupon-list">
          {shown.map(offer => <article className={`cart-coupon-card ${offer.eligible ? "" : "is-ineligible"}`} key={offer.id}>
            <div className="cart-coupon-code">{offer.code}</div>
            <div className="cart-coupon-info">
              <strong>{offerLabel(offer)}</strong>
              <span>{Number(offer.minimumOrder) ? `On orders above ${money(offer.minimumOrder)}` : "No minimum order"}</span>
              <small>Valid until {new Date(offer.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</small>
              {offer.eligible ? <small className="coupon-estimate">Estimated savings {money(offer.estimatedDiscount)}</small> : <small className="coupon-reason">{offer.reason}</small>}
            </div>
            <div className="cart-coupon-card-actions">
              {offer.recommended && <span className="coupon-recommended">★ Best saving</span>}
              <button type="button" disabled={!offer.eligible || quoteLoading || couponCode === offer.code} onClick={() => onApply(offer.code)}>{couponCode === offer.code ? "Selected" : "Apply"}</button>
            </div>
          </article>)}
        </div>
        {offers.length > 3 && <button className="cart-coupon-show-all" type="button" onClick={() => setShowAll(value => !value)}>{showAll ? "Show fewer offers ↑" : `View all ${offers.length} available offers →`}</button>}
        <small className="cart-coupon-footnote">Offers are checked again on the server when placing an order. Only one coupon applies per checkout.</small>
      </section>
    </div>
  );
}
