
import CustomerReturnsPanel from "./CustomerReturnsPanel.jsx";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { customerApi } from "../../services/customer/index.js";
import {
  PageState,
  PageHeading,
  SignInPrompt,
} from "../../components/customer/StorefrontComponents.jsx";
import { money } from "../../utils/format.js";
import "./orders-redesign.css";

// Load every page so older reviews are also recognized.
async function loadAllMyReviews() {
  const reviews = [];
  let page = 1;

  while (true) {
    const result = await customerApi.myReviews(page, 48);
    reviews.push(...(result.items || []));

    if (page >= (result.pages || 0)) break;
    page += 1;
  }

  return new Map(
    reviews.map((review) => [review.orderItemId, review])
  );
}

function ReviewForm({
  item,
  existingReview,
  onCancel,
  onSuccess,
}) {
  const editing = Boolean(existingReview);

  const [rating, setRating] = useState(
    existingReview?.rating || 5
  );
  const [title, setTitle] = useState(
    existingReview?.title || ""
  );
  const [comment, setComment] = useState(
    existingReview?.comment || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submitReview(event) {
    event.preventDefault();

    if (saving) return;

    setSaving(true);
    setError("");

    try {
      let result;

      if (editing) {
        result = await customerApi.updateReview(
          existingReview.id,
          {
            rating,
            title: title.trim(),
            comment: comment.trim(),
          }
        );
      } else {
        result = await customerApi.createReview({
          productId: item.productId,
          orderItemId: item.id,
          rating,
          title: title.trim(),
          comment: comment.trim(),
        });
      }

      await onSuccess(item.id, result);
    } catch (requestError) {
      setError(
        requestError.message ||
          "Unable to save your review."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="order-review-form"
      onSubmit={submitReview}
    >
      <div className="order-review-form-heading">
        <h4>
          {editing ? "Edit your review" : "Rate your purchase"}
        </h4>
        <p>{item.productName}</p>
      </div>

      <fieldset className="order-review-stars">
        <legend>Your rating</legend>

        <div className="order-review-star-options">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value}>
              <input
                type="radio"
                name={`rating-${item.id}`}
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                disabled={saving}
              />
              <span
                aria-label={`${value} star${value > 1 ? "s" : ""}`}
              >
                {value <= rating ? "★" : "☆"}
              </span>
            </label>
          ))}
        </div>

        <p>{rating} out of 5 stars</p>
      </fieldset>

      <label className="order-review-field">
        Review title
        <input
          className="form-control"
          value={title}
          onChange={(event) =>
            setTitle(event.target.value)
          }
          placeholder="Summarize your experience"
          minLength={1}
          maxLength={120}
          required
          disabled={saving}
        />
      </label>

      <label className="order-review-field">
        Your review
        <textarea
          className="form-control"
          value={comment}
          onChange={(event) =>
            setComment(event.target.value)
          }
          placeholder="Share your experience with other customers."
          rows={4}
          minLength={1}
          maxLength={5000}
          required
          disabled={saving}
        />
      </label>

      {error && (
        <p className="store-error" role="alert">
          {error}
        </p>
      )}

      <div className="order-review-actions">
        <button
          className="btn btn-primary"
          type="submit"
          disabled={
            saving || !title.trim() || !comment.trim()
          }
        >
          {saving
            ? "Saving..."
            : editing
              ? "Save changes"
              : "Submit review"}
        </button>

        <button
          className="btn btn-outline-secondary"
          type="button"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function OrdersPage({ signedIn }) {
  const { orderId } = useParams();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reviewsByItemId, setReviewsByItemId] = useState(
    new Map()
  );
  const [reviewsReady, setReviewsReady] = useState(false);
  const [reviewsError, setReviewsError] = useState("");

  const [reviewingItemId, setReviewingItemId] =
    useState(null);
  const [deletingItemId, setDeletingItemId] =
    useState(null);

  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState("NEWEST");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    let active = true;

    setReviewingItemId(null);
    setDeletingItemId(null);
    setNotice("");

    if (!signedIn) {
      setItems([]);
      setReviewsByItemId(new Map());
      setReviewsReady(false);
      setLoading(false);

      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError("");
    setReviewsError("");
    setReviewsReady(false);

    const ordersRequest = orderId
      ? customerApi.order(orderId).then(({ order }) => [
          order,
        ])
      : customerApi.orders().then(({ items }) => items);

    Promise.allSettled([
      ordersRequest,
      loadAllMyReviews(),
    ])
      .then(([ordersResult, reviewsResult]) => {
        if (!active) return;

        if (ordersResult.status === "fulfilled") {
          setItems(ordersResult.value || []);
        } else {
          setError(
            ordersResult.reason?.message ||
              "Unable to load orders."
          );
        }

        if (reviewsResult.status === "fulfilled") {
          setReviewsByItemId(reviewsResult.value);
          setReviewsReady(true);
        } else {
          setReviewsError(
            "Unable to load your reviews. Please refresh the page."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orderId, signedIn]);

  async function refreshReviews() {
    const reviews = await loadAllMyReviews();
    setReviewsByItemId(reviews);
    setReviewsReady(true);
  }

  async function reviewSaved(itemId) {
    try {
      await refreshReviews();
      setReviewingItemId(null);
      setNotice("Your review was saved successfully.");
    } catch (requestError) {
      setReviewsReady(false);
      setReviewsError(
        "Review saved, but its updated status could not be loaded. Please refresh the page."
      );
      setReviewingItemId(null);
    }
  }

  async function deleteReview(itemId, reviewId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this review?"
    );

    if (!confirmed) return;

    setDeletingItemId(itemId);
    setNotice("");
    setReviewsError("");

    try {
      await customerApi.deleteReview(reviewId);
      await refreshReviews();

      setReviewingItemId(null);
      setNotice("Your review was deleted successfully.");
    } catch (requestError) {
      setReviewsReady(false);
      setReviewsError(
        `Unable to confirm review deletion. ${requestError.message || "Please refresh the page."}`
      );
    } finally {
      setDeletingItemId(null);
    }
  }


  const statusOf = (order) => String(order.status || "PLACED").toUpperCase();
  const stateGroup = (order) => {
    const status = statusOf(order);
    if (status === "DELIVERED") return "DELIVERED";
    if (["CANCELLED", "CANCELED", "REFUNDED"].includes(status)) return "CANCELLED";
    if (["SHIPPED", "OUT_FOR_DELIVERY"].includes(status)) return "SHIPPED";
    return "PROCESSING";
  };
  const groups = ["ALL", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];
  const countByGroup = useMemo(() => {
    const result = { ALL: items.length, PROCESSING: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 };
    items.forEach((order) => { result[stateGroup(order)] += 1; });
    return result;
  }, [items]);
  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((order) => {
      const created = new Date(order.createdAt);
      if (statusFilter !== "ALL" && stateGroup(order) !== statusFilter) return false;
      if (fromDate && created < new Date(`${fromDate}T00:00:00`)) return false;
      if (toDate && created > new Date(`${toDate}T23:59:59.999`)) return false;
      if (!needle) return true;
      const haystack = [order.orderNumber, order.id, ...(order.shopOrders || []).flatMap((shopOrder) => [shopOrder.shop?.name, ...(shopOrder.items || []).flatMap((item) => [item.productName, item.sku])])]
        .filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    }).sort((a, b) => (sortBy === "OLDEST" ? 1 : -1) * (new Date(a.createdAt) - new Date(b.createdAt)));
  }, [items, search, statusFilter, fromDate, toDate, sortBy]);
  const clearFilters = () => { setSearch(""); setStatusFilter("ALL"); setFromDate(""); setToDate(""); setSortBy("NEWEST"); };
  const stages = ["PLACED", "CONFIRMED", "PAYMENT_PROCESSING", "INVENTORY_ALLOCATED", "PICKING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
  const displayStage = (stage) => stage === "PAYMENT_PROCESSING" ? "Payment" : stage === "INVENTORY_ALLOCATED" ? "Allocated" : stage === "OUT_FOR_DELIVERY" ? "Out for delivery" : stage.charAt(0) + stage.slice(1).toLowerCase().replaceAll("_", " ");
  const stageMilestones = ["PLACED", "CONFIRMED", "PAYMENT_PROCESSING", "SHIPPED", "DELIVERED"];

  if (!signedIn) {
    return <SignInPrompt title="Your orders" />;
  }

  return (
    <section className="account-page esh-orders-page">
      <div className="esh-orders-intro">
        <div className="esh-orders-heading">
          <div className="esh-orders-heading-icon" aria-hidden="true">▣</div>
          <div>
            <span className="esh-orders-eyebrow">YOUR E-SHOP HISTORY</span>
            <h1>{orderId ? "Order details" : "My Orders"}</h1>
            <p>Track your purchases, manage reviews and view your order history.</p>
          </div>
        </div>
        {!orderId && <div className="esh-orders-stats" aria-label="Order summary">
          {[{key:"ALL", label:"All orders", symbol:"▤"}, {key:"PROCESSING",label:"Processing",symbol:"◷"}, {key:"DELIVERED",label:"Delivered",symbol:"✓"}, {key:"CANCELLED",label:"Cancelled",symbol:"×"}].map(({key,label,symbol}) => (
            <button type="button" key={key} className={`esh-orders-stat ${statusFilter === key ? "is-active" : ""}`} onClick={() => setStatusFilter(key)}>
              <span className="esh-orders-stat-icon" aria-hidden="true">{symbol}</span>
              <span>{label}<strong>{countByGroup[key]}</strong></span>
            </button>
          ))}
        </div>}
      </div>
      {orderId && <Link className="esh-back-orders" to="/my-orders">← Back to all orders</Link>}
      {notice && <div className="store-toast" role="status">{notice}</div>}
      {reviewsError && <div className="store-alert" role="alert">{reviewsError}</div>}
      <PageState loading={loading} error={error}>
        <div className={`esh-orders-layout ${orderId ? "esh-orders-single" : ""}`}>
          {!orderId && <>
            <button type="button" className="esh-orders-mobile-filter" onClick={() => setMobileFiltersOpen((open) => !open)} aria-expanded={mobileFiltersOpen} aria-controls="esh-order-filter-panel">☷ Filters & dates</button>
            <aside id="esh-order-filter-panel" className={`esh-orders-filters ${mobileFiltersOpen ? "is-open" : ""}`} aria-label="Order filters">
              <h2>Order Filters</h2>
              <div className="esh-orders-filter-options">
                {groups.map((group) => <button key={group} type="button" className={statusFilter === group ? "active" : ""} onClick={() => { setStatusFilter(group); setMobileFiltersOpen(false); }}>
                  <span>{group === "ALL" ? "All Orders" : group.charAt(0) + group.slice(1).toLowerCase()}</span>
                  <strong>{countByGroup[group]}</strong>
                </button>)}
              </div>
              <h3>Order Date</h3>
              <label>From date<input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)}/></label>
              <label>To date<input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)}/></label>
              <button className="esh-orders-clear" type="button" onClick={clearFilters}>Clear Filters</button>
            </aside>
          </>}
          <div className="esh-orders-main">
            {!orderId && <div className="esh-orders-toolbar">
              <label className="esh-orders-search"><span className="sr-only">Search orders</span><input type="search" placeholder="Search by order ID, shop or product..." value={search} onChange={(event) => setSearch(event.target.value)}/></label>
              <label className="esh-orders-sort">Sort by <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="NEWEST">Recent first</option><option value="OLDEST">Oldest first</option></select></label>
            </div>}
            {!items.length ? <div className="store-empty">Orders you place will appear here.</div> : !filteredOrders.length ? <div className="esh-orders-no-results">No matching orders found. <button type="button" onClick={clearFilters}>Clear filters</button></div> : <>
              {!orderId && <div className="esh-orders-results">Showing {filteredOrders.length} of {items.length} orders</div>}
              <div className="esh-orders-list">
                {filteredOrders.map((order) => <article className="esh-order-card" key={order.id}>
                  <header className="esh-order-card-head">
                    <div><h2>Order #{order.orderNumber}</h2><p>Placed on {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle:"medium",timeStyle:"short" })}</p></div>
                    <span className={`esh-orders-status esh-status-${stateGroup(order).toLowerCase()}`}>{displayStage(statusOf(order))}</span>
                  </header>
                  {(order.shopOrders || []).map((shopOrder) => {
                    const currentStage = stages.indexOf(shopOrder.status);
                    return <section className="esh-order-shop" key={shopOrder.id}>
                      <div className="esh-order-shop-heading"><strong>▣ {shopOrder.shop?.name || "Shop"}</strong><span>{shopOrder.items.length} item(s) · {displayStage(shopOrder.status)}</span></div>
                      {!["CANCELLED","CANCELED"].includes(shopOrder.status) ? <ol className="esh-order-steps" aria-label="Order progress">
                        {stageMilestones.map((stage) => {
                          const stageIndex = stages.indexOf(stage);
                          const completed = currentStage >= stageIndex;
                          const current = shopOrder.status === stage;
                          return <li key={stage} className={`${completed ? "is-done" : ""} ${current ? "is-current" : ""}`}><span className="esh-order-step-dot">{completed && !current ? "✓" : current ? "●" : "○"}</span><span>{displayStage(stage)}</span></li>;
                        })}
                      </ol> : <p className="esh-order-cancelled-note">This shop order was cancelled.</p>}
                      <CustomerReturnsPanel shopOrderId={shopOrder.id} eligible={shopOrder.status === "DELIVERED"} />
                      {shopOrder.items.map((item) => {
                        const delivered = shopOrder.status === "DELIVERED";
                        const existingReview = reviewsByItemId.get(item.id);
                        const canReview = delivered && Boolean(item.id) && Boolean(item.productId);
                        const editing = reviewingItemId === item.id;
                        const deleting = deletingItemId === item.id;
                        return <div className="esh-order-item" key={item.id}>
                          <div className="esh-order-item-summary">
                            <div className="esh-order-placeholder" aria-hidden="true">▣</div>
                            <div className="esh-order-item-copy"><strong>{item.productName}</strong><span>{item.sku} · Qty: {item.quantity}</span></div>
                            <strong className="esh-order-item-price">{money(Number(item.unitPrice) * item.quantity)}</strong>
                          </div>
                          {delivered && !item.productId && <p className="order-review-hint">Review unavailable: product reference missing.</p>}
                          {canReview && reviewsReady && <div className="order-review-section">
                            {editing ? <ReviewForm key={`${item.id}-${existingReview?.id || "new"}`} item={item} existingReview={existingReview} onCancel={() => setReviewingItemId(null)} onSuccess={reviewSaved}/> : existingReview ? <div className="order-existing-review">
                              <span className="order-review-success">✓ Reviewed</span><p><strong>{existingReview.title}</strong></p><p className="order-review-rating">{"★".repeat(existingReview.rating)}{"☆".repeat(5 - existingReview.rating)}</p><p>{existingReview.comment}</p>
                              <div className="order-review-actions"><button type="button" className="btn btn-outline-primary btn-sm" disabled={deleting} onClick={() => { setNotice(""); setReviewingItemId(item.id); }}>Edit Review</button><button type="button" className="btn btn-outline-danger btn-sm" disabled={deleting} onClick={() => deleteReview(item.id, existingReview.id)}>{deleting ? "Deleting..." : "Delete Review"}</button></div>
                            </div> : <button className="btn btn-outline-primary btn-sm" type="button" onClick={() => { setNotice(""); setReviewingItemId(item.id); }}>★ Write a Review</button>}
                          </div>}
                        </div>;
                      })}
                    </section>;
                  })}
                  <footer className="esh-order-card-footer">
                    <div className="esh-order-payment"><span>Payment</span>{order.payments?.length ? order.payments.map((payment,index) => <strong key={`${payment.provider}-${index}`}>{payment.provider === "RAZORPAY" ? "Razorpay" : payment.provider} · {payment.status.replaceAll("_", " ")}</strong>) : <strong>Information unavailable</strong>}</div>
                    <div className="esh-order-total"><span>Order Total</span><strong>{money(order.grandTotal)}</strong></div>
                    {!orderId && <Link className="esh-order-view" to={`/orders/${order.id}`}>View Order →</Link>}
                  </footer>
                </article>)}
              </div>
            </>}
          </div>
        </div>
      </PageState>
    </section>
  );
}
