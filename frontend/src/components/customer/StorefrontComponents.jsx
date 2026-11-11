import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resolveMediaUrl } from '../../services/customer/index.js';
import { money } from '../../utils/format.js';
import { DemoPhoto, demoProductPhoto } from './DemoMedia.jsx';
import { useAuth } from "../../context/AuthContext.jsx";
function getVariantColor(variant) {
  const colorEntry = (variant?.values || []).find(
    ({ attribute }) =>
      attribute?.name?.trim().toLowerCase() === "color"
  );

  return colorEntry?.value?.id || null;
}

function getVariantImages(product, variant) {
  const images = product.images || [];
  const colorValueId = getVariantColor(variant);
  const genericImages = images.filter((image) => !image.colorValueId);

  if (!colorValueId) {
    // Some products only have color-specific uploaded photos. Never hide all of them.
    return genericImages.length ? genericImages : images;
  }

  const matchingImages = images.filter(
    (image) => image.colorValueId === colorValueId
  );

  // Exact selected color first; otherwise an uploaded generic/other-color photo
  // is preferable to a fabricated product image. Never alter variant selection.
  return matchingImages.length
    ? matchingImages
    : genericImages.length
      ? genericImages
      : images;
}


function ProductImage({ product, variant, imageIndex = 0 }) {
  const images = getVariantImages(product, variant);
  const image = images[imageIndex] || images[0];
  return <DemoPhoto
    src={image?.url}
    fallback={demoProductPhoto(product)}
    alt={product.name || "Product"}
    style={{ width: "100%", height: "100%", objectFit: "contain" }}
  />;
}

export function PageState({ loading, error, children }) {
  if (loading) return <div className="store-state" role="status">Loading E-Shop data…</div>;
  if (error) return <div className="store-state store-error" role="alert">{error}</div>;
  return children;
}

export function ProductGridSkeleton() {
  return <div className="store-product-grid store-product-grid-skeleton" role="status" aria-label="Loading products">
    {Array.from({ length: 8 }, (_, index) => <div className="product-card-skeleton" key={index}>
      <span className="skeleton-image" />
      <span className="skeleton-line skeleton-category" />
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-short" />
      <span className="skeleton-button" />
    </div>)}
  </div>;
}


export function ProductCard({ product, favourite, onFavourite }) {
  const { user } = useAuth();

  const isBrowseOnly = [
    "SUPER_ADMIN",
    "SHOP_OWNER",
    "SHOP_EMPLOYEE",
  ].includes(user?.role);
  // Show the first available active variant for the card's price.
  const activeVariants = (product.variants || []).filter(
    (item) => item.isActive !== false
  );

  const variant =
    activeVariants.find((item) => Number(item.stock) > 0) ||
    activeVariants[0];

  const originalPrice = Number(variant?.price);
  const discounted = Number(variant?.discountPrice);

  const hasValidDiscount =
    Number.isFinite(originalPrice) &&
    originalPrice > 0 &&
    discounted > 0 &&
    discounted < originalPrice;

  const currentPrice = hasValidDiscount
    ? variant.discountPrice
    : variant?.price;

  const discountPercent = hasValidDiscount
    ? Math.round(((originalPrice - discounted) / originalPrice) * 100)
    : 0;

  const outOfStock =
    product.status !== "ACTIVE" ||
    product.shop?.status !== "ACTIVE" ||
    !variant ||
    Number(variant.stock) < 1;

  const ratingsCount = Number(product.reviewCount || 0);
  const averageRating = Number(product.averageRating || 0);

  const createdDate = product.createdAt
    ? new Date(product.createdAt).getTime()
    : NaN;

  const isNew =
    Number.isFinite(createdDate) &&
    Date.now() >= createdDate &&
    Date.now() - createdDate <= 30 * 86400000;

  return (
    <article className="store-product-card esh-premium-product-card">
      <div className="esh-card-image-wrap">
        <Link
          to={`/products/${product.id}`}
          className="store-product-image"
          aria-label={`View ${product.name}`}
        >
          <ProductImage
            product={product}
            variant={variant}
            imageIndex={0}
          />
        </Link>

        {discountPercent > 0 && (
          <span className="esh-discount-badge">
            {discountPercent}% OFF
          </span>
        )}

        {isNew && (
          <span className="esh-new-badge">NEW</span>
        )}

        {!isBrowseOnly && (
  <button
    className={`favourite-button ${favourite ? "saved" : ""}`}
    type="button"
    aria-label={
      favourite
        ? "Remove from wishlist"
        : "Add to wishlist"
    }
    aria-pressed={Boolean(favourite)}
    onClick={() => onFavourite(product)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 8.8c0 4.1-8.5 10-8.5 10s-8.5-5.9-8.5-10a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2Z" />
    </svg>
  </button>
)}
      </div>

      <div className="store-product-info">
        <span className="product-category">
          {product.brand?.name ||
            product.category?.name ||
            "E-Shop"}
        </span>

        <Link
          to={`/products/${product.id}`}
          className="store-product-name"
        >
          {product.name}
        </Link>

        <div className="esh-card-meta">
          {ratingsCount > 0 && Number.isFinite(averageRating) && (
            <Link
              to={`/products/${product.id}#reviews`}
              className="esh-card-rating"
              aria-label={`Rated ${averageRating.toFixed(1)} from ${ratingsCount} reviews`}
            >
              <span aria-hidden="true">★</span>{" "}
              {averageRating.toFixed(1)}{" "}
              <small>({ratingsCount})</small>
            </Link>
          )}

          {product.shop?.name && (
            <span className="seller-name">
              {product.shop.name}
            </span>
          )}
        </div>

        <div className="store-price-row">
          <strong>
            {currentPrice == null
              ? "Unavailable"
              : money(currentPrice)}
          </strong>

          {hasValidDiscount && (
            <del>{money(variant.price)}</del>
          )}
        </div>

        <div className="esh-card-availability">
          <span
            className={`esh-card-stock ${outOfStock ? "out" : ""}`}
          >
            {outOfStock ? "Out of stock" : "In stock"}
          </span>
        </div>

        <Link
          to={`/products/${product.id}`}
          className="btn btn-primary w-100 esh-card-add-button"
        >
          View Product
        </Link>
      </div>
    </article>
  );
}


export function ProductGrid({ products, favouriteIds, signedIn, onFavourite, onAdd }) {
  if (!products.length) return <div className="store-empty"><span>Nothing here just yet</span><p>Try a different search or category.</p></div>;
  return <div className={`store-product-grid ${products.length <= 2 ? "store-product-grid-sparse" : ""}`}>{products.map((product) => (
    <ProductCard
      key={product.id}
      product={product}
      favourite={favouriteIds.has(product.id)}
      signedIn={signedIn}
      onFavourite={onFavourite}
      onAdd={onAdd}
    />
  ))}</div>;
}


export function PageHeading({ eyebrow, title, description }) {
  return <div className="account-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>;
}



export function SignInPrompt({ title }) {
  const navigate = useNavigate();
  const { activePortal } = useAuth();

  const staffPortalActive =
    activePortal === "shop-owner" ||
    activePortal === "super-admin";

  const dashboardPath =
    activePortal === "super-admin"
      ? "/admin/dashboard"
      : "/shop/dashboard";

  const portalName =
    activePortal === "super-admin"
      ? "Super Admin"
      : "Shop Owner";

  if (staffPortalActive) {
    return (
      <section className="sign-in-prompt" role="status">
        <span className="eyebrow">
          RESTRICTED CUSTOMER ACCESS
        </span>

        <h1>Customer Account Access Restricted</h1>

        <p>
          You're currently signed in to the {portalName}
          {" "}portal. {title} is available only to
          Customer accounts.
        </p>

        <button
          className="btn btn-primary"
          type="button"
          onClick={() => navigate(dashboardPath)}
        >
          Back to {portalName} Dashboard
        </button>
      </section>
    );
  }

  return (
    <section className="sign-in-prompt">
      <span className="eyebrow">CUSTOMER ACCOUNT</span>

      <h1>{title}</h1>

      <p>
        Sign in to see information saved securely
        to your account.
      </p>

      <button
        className="btn btn-primary"
        type="button"
        onClick={() => navigate("/?signin=1")}
      >
        Sign in to continue
      </button>
    </section>
  );
}
