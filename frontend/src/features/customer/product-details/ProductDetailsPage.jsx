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
import ProductDescription from "./ProductDescription.jsx";
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
   browseOnly = false,
  onFavourite,
  onAdd,
}) {
  const { productId } = useParams();

  const [product, setProduct] = useState(null);
  const [variantId, setVariantId] = useState("");
  const [selectedGalleryImageId, setSelectedGalleryImageId] = useState(null);
  const [preferVariantImage, setPreferVariantImage] = useState(false);
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
        setSelectedGalleryImageId(null);
        setPreferVariantImage(false);
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

  // Each group corresponds to a purchasable option actually saved on a SKU.
  const variantGroups = [];
  for (const item of activeVariants) {
    for (const entry of item.values || []) {
      if (!entry.attribute?.name || !entry.value?.id) continue;
      const name = entry.attribute.name.trim();
      let group = variantGroups.find((group) => group.name.toLowerCase() === name.toLowerCase());
      if (!group) {
        group = { name, options: [] };
        variantGroups.push(group);
      }
      if (!group.options.some((option) => option.id === entry.value.id)) {
        group.options.push({ id: entry.value.id, label: entry.value.value });
      }
    }
  }
  variantGroups.sort((a, b) => {
    const priority = (name) => name.toLowerCase() === "color" ? 0 : name.toLowerCase() === "size" ? 1 : 2;
    return priority(a.name) - priority(b.name);
  });

  // Always use the actual selected SKU for price, inventory and cart.
  // Some products have a standard variant alongside Color / Size variants.
  const variant = activeVariants.find((item) => item.id === variantId) || null;

  function selectVariant(item) {
    if (!item) return;
    setVariantId(item.id);
    setSelectedColorId(attributeValue(item, "color")?.id || "");
    setSelectedSizeId(attributeValue(item, "size")?.id || "");
    setSelectedGalleryImageId(null);
    setPreferVariantImage(true);
    setQuantity(1);
  }

  function chooseOption(attributeName, valueId) {
    const matches = activeVariants.filter((item) =>
      (item.values || []).some((entry) =>
        entry.attribute?.name?.trim().toLowerCase() === attributeName.toLowerCase() &&
        entry.value?.id === valueId
      )
    );
    if (!matches.length) return;

    // Preserve the other chosen attributes when a real SKU has that combination.
    const otherSelected = (variant?.values || []).filter((entry) =>
      entry.attribute?.name?.trim().toLowerCase() !== attributeName.toLowerCase()
    );
    const exact = matches.find((item) => otherSelected.every((entry) =>
      (item.values || []).some((candidate) =>
        candidate.attribute?.name?.trim().toLowerCase() ===
          entry.attribute?.name?.trim().toLowerCase() &&
        candidate.value?.id === entry.value?.id
      )
    ));

    // If that combination does not exist, choose an actual saved SKU and
    // update all highlighted options, rather than inventing a combination.
    selectVariant(exact || matches.find((item) => Number(item.stock) > 0) || matches[0]);
  }

  // Product images and variant images remain separate in the gallery.
  // On initial page load the main product image is shown first.
  // Selecting a variant prioritizes its own photo.
  const allImages = product?.images || [];
  const genericImages = allImages.filter(
    (image) => !image.variantId && !image.colorValueId
  );
  const variantImages = variant?.id
    ? allImages.filter((image) => image.variantId === variant.id)
    : [];
  const colorImages = selectedColorId
    ? allImages.filter(
        (image) => image.colorValueId === selectedColorId && !image.variantId
      )
    : [];

  const galleryImages = [...genericImages, ...variantImages, ...colorImages]
    .filter((image, index, images) =>
      images.findIndex((other) => other.id === image.id) === index
    );

  const selectedVariantPhoto = variantImages[0] || colorImages[0] || null;
  const visibleImage =
    galleryImages.find((image) => image.id === selectedGalleryImageId) ||
    (preferVariantImage ? selectedVariantPhoto : genericImages[0]) ||
    genericImages[0] ||
    selectedVariantPhoto ||
    allImages[0] ||
    null;

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
              {galleryImages.length > 1 && (
                <div
                  className="product-gallery-thumbnails"
                  aria-label="Product image gallery"
                  style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}
                >
                  {galleryImages.map((image, index) => {
                    const url = resolveMediaUrl(image.url);
                    return (
                      <button
                        key={image.id}
                        type="button"
                        aria-label={`View product photo ${index + 1}`}
                        aria-pressed={visibleImage?.id === image.id}
                        onClick={() => setSelectedGalleryImageId(image.id)}
                        style={{
                          width: 72, height: 72, padding: 4, borderRadius: 10,
                          border: visibleImage?.id === image.id
                            ? "2px solid #2563eb" : "1px solid #cbd5e1",
                          background: "white", cursor: "pointer",
                        }}
                      >
                        {url && (
                          <img
                            src={url}
                            alt={`${product.name} thumbnail ${index + 1}`}
                            style={{ width: "100%", height: "100%", objectFit: "contain" }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Full description below product image */}
  <ProductDescription
    key={product.id}
    description={product.description}
  />



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

              <p className="detail-description detail-short-description">
                  {product.shortDescription?.trim() ||
                    `${String(product.description || "").trim().slice(0, 160)}${
                      String(product.description || "").trim().length > 160 ? "..." : ""
                    }`}
              </p>
              {displayVariant && (
                <div className="detail-price">
                  {money(displayVariant.discountPrice || displayVariant.price)}
                  {displayVariant.discountPrice && <del>{money(displayVariant.price)}</del>}
                </div>
              )}
              {activeVariants.length > 0 && (
                <section className="professional-variant-picker" aria-label="Choose Product Variant">
                  <div className="professional-variant-heading">
                    <h2>Choose Product Variant</h2>
                    <p>Select your preferred option</p>
                  </div>

                  {variantGroups.map((group) => {
                    const selectedValue = (variant?.values || []).find((entry) =>
                      entry.attribute?.name?.trim().toLowerCase() === group.name.toLowerCase()
                    )?.value?.id;
                    const isColor = group.name.toLowerCase() === "color";
                    return (
                      <div className="professional-variant-option-row" key={group.name}>
                        <div className="professional-variant-option-label">
                          {group.name}
                        </div>
                        <div className="professional-variant-option-list">
                          {group.options.map((option) => {
                            const selected = selectedValue === option.id;
                            const swatch = SWATCH_COLORS[String(option.label).toLowerCase()];
                            return (
                              <button
                                type="button"
                                key={option.id}
                                className={`professional-variant-option ${selected ? "is-selected" : ""}`}
                                aria-pressed={selected}
                                onClick={() => chooseOption(group.name, option.id)}
                              >
                                {isColor && (
                                  <span
                                    className="professional-variant-swatch"
                                    style={{ backgroundColor: swatch || "#e2e8f0" }}
                                    aria-hidden="true"
                                  />
                                )}
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Attribute-less variants still need their own selectable SKU. */}
                  {(variantGroups.length === 0 || activeVariants.some((item) => !item.values?.length)) && (
                    <div className="professional-variant-option-row">
                      <div className="professional-variant-option-label">Variant</div>
                      <div className="professional-variant-option-list">
                        {activeVariants
                          .filter((item) => variantGroups.length === 0 || !item.values?.length)
                          .map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              aria-pressed={item.id === variantId}
                              className={`professional-variant-option ${item.id === variantId ? "is-selected" : ""}`}
                              onClick={() => selectVariant(item)}
                            >
                              {item.variantName || item.sku}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {variant && (
                    <div className="professional-selected-variant" aria-live="polite">
                      {(() => {
                        const image = allImages.find((entry) => entry.variantId === variant.id)
                          || allImages.find((entry) => !entry.variantId && !entry.colorValueId);
                        const imageUrl = image?.url ? resolveMediaUrl(image.url) : null;
                        return imageUrl ? (
                          <img src={imageUrl} alt={variant.variantName || variant.sku} />
                        ) : (
                          <span className="professional-variant-image-placeholder" aria-hidden="true">SKU</span>
                        );
                      })()}
                      <div className="professional-selected-variant-info">
                        <strong>
                          {(variant.values || []).map(({ attribute, value }) =>
                            `${attribute.name}: ${value.value}`).join(" · ") ||
                            variant.variantName || variant.sku}
                        </strong>
                        <small className="professional-variant-sku">SKU: {variant.sku}</small>
                        <span className={Number(variant.stock) > 0 ? "professional-variant-in-stock" : "professional-variant-out-stock"}>
                          {Number(variant.stock) > 0 ? `${variant.stock} available` : "Out of stock"}
                        </span>
                      </div>
                      <div className="professional-selected-variant-price">
                        <strong>{money(variant.discountPrice || variant.price)}</strong>
                        {variant.discountPrice && <del>{money(variant.price)}</del>}
                      </div>
                      <span className="professional-variant-check" aria-hidden="true">✓</span>
                    </div>
                  )}
                </section>
              )}

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

              <p className={canBuy ? "availability available" : "availability unavailable"}>
                {!variant
                  ? "Currently unavailable"
                  : !canBuy
                    ? "Currently out of stock"
                    : `${variant.stock} available`}
              </p>

              {canBuy && (
                <div className="detail-buy-row">
                  <div className="detail-quantity-control">
  <span className="detail-quantity-label">Qty</span>

  <div className="detail-quantity-selector">
    <button
      type="button"
      className="detail-quantity-button"
      aria-label="Decrease quantity"
      disabled={quantity <= 1}
      onClick={() => setQuantity((current) => Math.max(1, current - 1))}
    >
      −
    </button>

    <span className="detail-quantity-value" aria-live="polite">
      {quantity}
    </span>

    <button
      type="button"
      className="detail-quantity-button"
      aria-label="Increase quantity"
      disabled={quantity >= Math.min(Number(variant.stock), 100)}
      onClick={() =>
        setQuantity((current) =>
          Math.min(current + 1, Number(variant.stock), 100)
        )
      }
    >
      +
    </button>
  </div>
</div>
                  <button
  className={`btn btn-lg ${
    browseOnly ? "btn-secondary" : "btn-primary"
  }`}
  type="button"
  disabled={browseOnly || !signedIn}
  onClick={() => {
    if (browseOnly || !signedIn) return;
    onAdd(product, variant, quantity);
  }}
  title={
    browseOnly
      ? "Purchasing is available only to customer accounts"
      : undefined
  }
>
  {browseOnly
    ? "Shopping Disabled — Preview Mode"
    : signedIn
      ? "Add to cart"
      : "Sign in to shop"}
</button>
                </div>
              )}

              {!browseOnly && (
  <button
    className="btn btn-outline-primary"
    type="button"
    onClick={() => onFavourite(product)}
  >
    {favouriteIds.has(product.id)
      ? "♥ Saved to favourites"
      : "♡ Add to favourites"}
  </button>
)}
            </div>
          </section>

          <section
            id="reviews"
            className="product-reviews-section"
            aria-labelledby="product-reviews-heading"
          >
           <div className="product-reviews-heading">
  <h2 id="product-reviews-heading">
    Product Ratings & Reviews
  </h2>

  <p>Customer feedback for this product</p>
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
  <p>No reviews yet. Be the first to review this product.</p>
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
