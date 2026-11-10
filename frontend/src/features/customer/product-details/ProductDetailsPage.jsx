import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  customerApi,
  resolveMediaUrl,
} from "../../../services/customer/index.js";
import { DemoPhoto, demoProductPhoto } from "../../../components/customer/DemoMedia.jsx";
import ProductImageAttribution from "../../../components/customer/ProductImageAttribution.jsx";
import { PageState } from "../../../components/customer/StorefrontComponents.jsx";
import ProductRating from "../../../components/customer/reviews/ProductRating.jsx";
import { money } from "../../../utils/format.js";

// Read the Color / Size values attached to a concrete SKU variant.
function attributeValue(variant, name) {
  return (variant?.values || []).find(
    (entry) => entry.attribute?.name?.trim().toLowerCase() === name
  )?.value || null;
}

function getOptions(variants, name) {
  const options = new Map();
  for (const variant of variants) {
    const value = attributeValue(variant, name);
    if (value?.id) options.set(value.id, value);
  }
  return [...options.values()];
}

const SWATCH_COLORS = {
  black: "#242424", blue: "#3467a8", red: "#ba3545",
  white: "#ffffff", green: "#39815b", grey: "#888888",
  gray: "#888888", navy: "#183450", yellow: "#e8c84e",
  pink: "#e69ab0", brown: "#79543f", beige: "#dec8a4",
};

function RatingBreakdown({ distribution = {}, total = 0 }) {
  return (
    <div className="review-distribution">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = Number(distribution[star] || 0);
        const percentage = total > 0 ? (count / total) * 100 : 0;

        return (
          <div className="review-distribution-row" key={star}>
            <span>{star} ★</span>
            <div
              className="review-distribution-track"
              role="meter"
              aria-label={`${star} star reviews`}
              aria-valuemin={0}
              aria-valuemax={total || 1}
              aria-valuenow={count}
            >
              <div
                className="review-distribution-fill"
                style={{ width: `${percentage}%`}}
              />
            </div>
            <span>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ProductDetails({
  favouriteIds,
  signedIn,
  onFavourite,
  onAdd,
}) {
  const { productId } = useParams();

  const [product, setProduct] = useState(null);
  const [variantId, setVariantId] = useState("");
  const [selectedColorId, setSelectedColorId] = useState("");
  const [selectedSizeId, setSelectedSizeId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [reviews, setReviews] = useState(null);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");
    setProduct(null);

    customerApi
      .product(productId)
      .then(({ product: result }) => {
        if (!active) return;

        setProduct(result);

        const inStock = result.variants.find(
          (variant) => variant.stock > 0
        );

        const initialVariant = inStock || result.variants[0];
        setVariantId(initialVariant?.id || "");
        setSelectedColorId(attributeValue(initialVariant, "color")?.id || "");
        setSelectedSizeId(attributeValue(initialVariant, "size")?.id || "");
        setQuantity(1);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId]);

  useEffect(() => {
    setReviewsPage(1);
    setReviews(null);
  }, [productId]);

  useEffect(() => {
    let active = true;

    setReviewsLoading(true);
    setReviewsError("");

    customerApi
      .productReviews(productId, reviewsPage, 5)
      .then((result) => {
        if (active) setReviews(result);
      })
      .catch((requestError) => {
        if (active) setReviewsError(requestError.message);
      })
      .finally(() => {
        if (active) setReviewsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId, reviewsPage]);

  const activeVariants = (product?.variants || []).filter(
    (item) => item.isActive !== false
  );
  const colors = getOptions(activeVariants, "color");
  const sizes = getOptions(activeVariants, "size");
  const hasSwatchSelector = colors.length > 0 || sizes.length > 0;

  // The exact color + size must exist. Never silently switch sizes.
  const variant = hasSwatchSelector
    ? activeVariants.find((item) =>
        (colors.length === 0 || attributeValue(item, "color")?.id === selectedColorId) &&
        (sizes.length === 0 || attributeValue(item, "size")?.id === selectedSizeId)
      )
    : activeVariants.find((item) => item.id === variantId);

  // Show one photo for the selected color, not all color variants together.
  const allImages = product?.images || [];
  const colorImages = selectedColorId
    ? allImages.filter((image) => image.colorValueId === selectedColorId)
    : [];
  const genericImages = allImages.filter((image) => !image.colorValueId);
  // Keep the gallery populated when only color-specific images exist or the
  // selected variant lacks a matching upload. This does not change the variant.
  const visibleImage = colorImages[0] || genericImages[0] || allImages[0] || null;
  const canBuy = Boolean(
    variant && Number(variant.stock) > 0 &&
    product?.status === "ACTIVE" && product?.shop?.status === "ACTIVE"
  );
  const displayVariant = variant || activeVariants[0];

  const averageRating =
    Number(reviews?.averageRating ?? product?.averageRating ?? 0);

  const reviewCount =
    Number(reviews?.total ?? product?.reviewCount ?? 0);

  return (
    <PageState loading={loading} error={error}>
      {product && (
        <>
          <section className="product-detail">
            <div className="detail-gallery">
              {visibleImage ? (
                <div className="detail-image-with-credit" key={visibleImage.id || visibleImage.url}>
                  <DemoPhoto
                    src={visibleImage.url}
                    fallback={demoProductPhoto(product)}
                    alt={`${product.name}${colors.length ? ` - ${colors.find((c) => c.id === selectedColorId)?.value || ""}` : ""}`}

                  />
                  <ProductImageAttribution imageUrl={visibleImage.url} />
                </div>
              ) : (
                <DemoPhoto fallback={demoProductPhoto(product)} alt={product.name} />
              )}
            </div>

            <div className="detail-copy">
              <div className="breadcrumbs">
                <Link to="/">Home</Link>
                <span>/</span>
                <span>{product.category.name}</span>
              </div>

              <span className="eyebrow">
                {product.brand?.name || product.category.name}
              </span>

              <h1>{product.name}</h1>

              <a href="#reviews" className="product-rating-link">
                <ProductRating
                  averageRating={averageRating}
                  reviewCount={reviewCount}
                  size="lg"
                />
              </a>

              <p className="seller-line">
                Sold by <strong>{product.shop.name}</strong>
              </p>

              <p className="detail-description">
                {product.description}
              </p>
              {product.specifications && Object.keys(product.specifications).length > 0 && (
                <section aria-label="Technical specifications" style={{ margin: '18px 0' }}>
                  <h2 style={{ fontSize: '1.15rem' }}>Technical specifications</h2>
                  <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1fr) 2fr', gap: '8px 16px' }}>
                    {Object.entries(product.specifications).map(([key, value]) => (
                      <Fragment key={key}>
                        <dt style={{ fontWeight: 600 }}>{key}</dt>
                        <dd style={{ margin: 0 }}>{String(value)}</dd>
                      </Fragment>
                    ))}
                  </dl>
                </section>
              )}

              {colors.length > 0 && (
                <fieldset className="detail-option" style={{ border: 0, margin: "16px 0", padding: 0 }}>
                  <legend style={{ fontWeight: 600, marginBottom: 10 }}>
                    Color: {colors.find((color) => color.id === selectedColorId)?.value || "Choose color"}
                  </legend>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {colors.map((color) => {
                      const selected = selectedColorId === color.id;
                      const swatch = SWATCH_COLORS[color.value.toLowerCase()] || color.value.toLowerCase();
                      return (
                        <button
                          key={color.id}
                          type="button"
                          aria-label={`Choose ${color.value} color`}
                          aria-pressed={selected}
                          title={color.value}
                          onClick={() => {
                            setSelectedColorId(color.id);
                            setQuantity(1);
                          }}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                            background: "transparent", border: 0, cursor: "pointer", padding: 3,
                          }}
                        >
                          <span style={{
                            width: 35, height: 35, display: "block", borderRadius: "50%",
                            background: swatch, border: selected ? "3px solid #2563eb" : "1px solid #888",
                            outline: selected ? "2px solid #fff" : "none",
                            boxShadow: selected ? "0 0 0 2px #2563eb" : "none",
                          }} />
                          <small>{color.value}</small>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {sizes.length > 0 && (
                <fieldset className="detail-option" style={{ border: 0, margin: "16px 0", padding: 0 }}>
                  <legend style={{ fontWeight: 600, marginBottom: 10 }}>
                    Size: {sizes.find((size) => size.id === selectedSizeId)?.value || "Choose size"}
                  </legend>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {sizes.map((size) => (
                      <button
                        key={size.id}
                        type="button"
                        className={selectedSizeId === size.id ? "btn btn-primary" : "btn btn-outline-primary"}
                        aria-pressed={selectedSizeId === size.id}
                        onClick={() => {
                          setSelectedSizeId(size.id);
                          setQuantity(1);
                        }}
                      >
                        {size.value}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {!hasSwatchSelector && activeVariants.length > 1 && (
                <label className="detail-option">
                  Choose an option
                  <select value={variantId} onChange={(event) => {
                    setVariantId(event.target.value);
                    setQuantity(1);
                  }}>
                    {activeVariants.map((item) => (
                      <option value={item.id} key={item.id}>
                        {(item.values || []).map(({ attribute, value }) =>
                          `${attribute.name}: ${value.value}`).join(" · ") || item.sku}
                        {` · ${Number(item.stock) > 0 ? `${item.stock} available` : "Out of stock"}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {displayVariant && (
                <div className="detail-price">
                  {money(displayVariant.discountPrice || displayVariant.price)}
                  {displayVariant.discountPrice && <del>{money(displayVariant.price)}</del>}
                </div>
              )}

              <p className={canBuy ? "availability available" : "availability unavailable"}>
                {!variant && hasSwatchSelector
                  ? "This color and size combination is unavailable"
                  : !variant
                    ? "Currently unavailable"
                    : !canBuy
                      ? "Currently out of stock"
                      : `${variant.stock} available`}
              </p>

              {canBuy && (
                <div className="detail-buy-row">
                  <label>
                    Qty
                    <input
                      type="number"
                      min="1"
                      max={Math.min(Number(variant.stock), 100)}
                      value={quantity}
                      onChange={(event) => {
                        const requested = Number(event.target.value) || 1;
                        setQuantity(Math.min(Math.max(1, requested), Number(variant.stock), 100));
                      }}
                    />
                  </label>
                  <button
                    className="btn btn-primary btn-lg"
                    type="button"
                    disabled={!signedIn}
                    onClick={() => onAdd(product, variant, quantity)}
                  >
                    {signedIn ? "Add to cart" : "Sign in to shop"}
                  </button>
                </div>
              )}

              <button
                className="btn btn-outline-primary"
                type="button"
                onClick={() => onFavourite(product)}
              >
                {favouriteIds.has(product.id)
                  ? "♥ Saved to favourites"
                  : "♡ Add to favourites"}
              </button>
            </div>
          </section>

          <section
            id="reviews"
            className="product-reviews-section"
            aria-labelledby="product-reviews-heading"
          >
            <div className="product-reviews-heading">
              <span className="eyebrow">
                CUSTOMER FEEDBACK
              </span>

              <h2 id="product-reviews-heading">
                Ratings & Reviews
              </h2>

              <p>Reviews from customers who purchased this product.</p>
            </div>

            {reviewsLoading && (
              <p role="status">Loading customer reviews...</p>
            )}

            {reviewsError && (
              <p className="store-error" role="alert">
                {reviewsError}
              </p>
            )}

            {reviews && (
              <>
                <div className="product-rating-summary">
                  <div className="product-rating-overview">
                    <strong className="product-rating-score">
                      {averageRating.toFixed(1)}
                      <span> / 5</span>
                    </strong>

                    <ProductRating
                      averageRating={averageRating}
                      reviewCount={reviewCount}
                      size="lg"
                    />

                    <p>
                      {reviewCount} customer{" "}
                      {reviewCount === 1 ? "review" : "reviews"}
                    </p>
                  </div>

                  <RatingBreakdown
                    distribution={reviews.distribution}
                    total={reviewCount}
                  />
                </div>

                <div className="product-review-list">
                  {reviews.items.length === 0 ? (
                    <div className="product-review-empty">
                      <h3>No reviews yet</h3>
                      <p>
                        This product has not received any customer
                        reviews.
                      </p>
                    </div>
                  ) : (
                    reviews.items.map((review) => (
                      <article
                        className="product-customer-review"
                        key={review.id}
                      >
                        <div className="product-review-stars">
                          {"★".repeat(review.rating)}
                          <span>
                            {"☆".repeat(5 - review.rating)}
                          </span>
                        </div>

                        <h3>{review.title}</h3>

                        <p>{review.comment}</p>

                        <time
                          dateTime={review.createdAt}
                          className="product-review-date"
                        >
                          {new Date(
                            review.createdAt
                          ).toLocaleDateString("en-IN", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                      </article>
                    ))
                  )}
                </div>

                {reviews.pages > 1 && (
                  <div className="product-review-pagination">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={reviewsPage <= 1|| reviewsLoading}
                      onClick={() =>
                        setReviewsPage((page) =>page - 1)
                      }
                    >
                      Previous
                    </button>

                    <span>
                      Page {reviewsPage} of {reviews.pages}
                    </span>

                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={
                        reviewsPage >= reviews.pages ||
                        reviewsLoading
                      }
                      onClick={() =>
                        setReviewsPage((page) =>page + 1)
                      }
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </PageState>
  );
}
