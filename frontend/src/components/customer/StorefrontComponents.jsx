import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resolveMediaUrl } from '../../services/customer/index.js';
import { money } from '../../utils/format.js';
import ProductRating from './reviews/ProductRating.jsx';
const availableVariant = (product) => product.variants?.find((variant) => variant.stock > 0) || product.variants?.[0];

function ProductImage({ product, imageIndex = 0 }) {
  const image = product.images?.[imageIndex];
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => setUnavailable(false), [image?.url]);

  if (!image || unavailable) {
    return <span aria-hidden="true">{product.name?.trim().charAt(0).toUpperCase() || "E"}</span>;
  }
  return <img src={resolveMediaUrl(image.url)} alt={product.name} loading="lazy" onError={() => setUnavailable(true)} />;
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

export function ProductCard({ product, favourite, signedIn, onFavourite, onAdd }) {
  const [imageIndex, setImageIndex] = useState(0);
  const variant = availableVariant(product);
  const originalPrice = Number(variant?.price);
  const discounted = Number(variant?.discountPrice);
  const hasValidDiscount = Number.isFinite(originalPrice) && originalPrice > 0 && discounted > 0 && discounted < originalPrice;
  const currentPrice = hasValidDiscount ? variant.discountPrice : variant?.price;
  const discountPercent = hasValidDiscount ? Math.round(((originalPrice - discounted) / originalPrice) * 100) : 0;
  const outOfStock = product.status !== "ACTIVE" || product.shop?.status !== "ACTIVE" || !variant || Number(variant.stock) < 1;
  const images = product.images || [];
  const displayImageIndex = Math.min(imageIndex, Math.max(0, images.length - 1));
  const ratingsCount = Number(product.reviewCount || 0);
  const averageRating = Number(product.averageRating || 0);
  const createdDate = product.createdAt ? new Date(product.createdAt).getTime() : NaN;
  const isNew = Number.isFinite(createdDate) && Date.now() >= createdDate && Date.now() - createdDate <= 30 * 86400000;
  const sizes = [...new Set((product.variants || []).flatMap((item) =>
    (item.values || []).filter(({ attribute }) => /^(size|sizes)$/i.test(attribute?.name?.trim() || "")).map(({ value }) => value?.value).filter(Boolean)
  ))];

  return <article className="store-product-card esh-premium-product-card">
    <div className="esh-card-image-wrap">
      <Link to={`/products/${product.id}`} className="store-product-image" aria-label={`View ${product.name}`}>
        <ProductImage product={product} imageIndex={displayImageIndex} />
      </Link>
      {discountPercent > 0 && <span className="esh-discount-badge">{discountPercent}% OFF</span>}
      {isNew && <span className="esh-new-badge">NEW</span>}
      <button className={`favourite-button ${favourite ? "saved" : ""}`} type="button"
        aria-label={favourite ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={favourite}
        onClick={() => onFavourite(product)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 8.8c0 4.1-8.5 10-8.5 10s-8.5-5.9-8.5-10a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2Z" /></svg>
      </button>
      {images.length > 1 && <div className="esh-card-image-dots" aria-label={`Photos of ${product.name}`}>
        {images.slice(0, 6).map((image, index) => <button key={image.id || image.url || index} type="button"
          className={displayImageIndex === index ? "active" : ""}
          aria-label={`Show image ${index + 1} of ${product.name}`}
          aria-pressed={displayImageIndex === index}
          onClick={() => setImageIndex(index)} />)}
      </div>}
    </div>
    <div className="store-product-info">
      <span className="product-category">{product.brand?.name || product.category?.name || "E-Shop"}</span>
      <Link to={`/products/${product.id}`} className="store-product-name">{product.name}</Link>
      <div className="esh-card-meta">
        {ratingsCount > 0 && Number.isFinite(averageRating) && <Link
          to={`/products/${product.id}#reviews`} className="esh-card-rating"
          aria-label={`Rated ${averageRating.toFixed(1)} from ${ratingsCount} reviews`}>
          <span aria-hidden="true">★</span> {averageRating.toFixed(1)} <small>({ratingsCount})</small>
        </Link>}
        {ratingsCount > 0 && product.shop?.name && <span aria-hidden="true" className="esh-meta-separator">·</span>}
        <span className="seller-name">{product.shop?.name || "E-Shop seller"}</span>
      </div>
      <div className="store-price-row">
        <strong>{currentPrice === undefined ? "Unavailable" : money(currentPrice)}</strong>
        {hasValidDiscount && <del>{money(variant.price)}</del>}
      </div>
      <div className="esh-card-availability">
        <span className={`esh-card-stock ${outOfStock ? "out" : ""}`}>{outOfStock ? "Out of stock" : "● In stock"}</span>
        {sizes.length > 0 && <small title={sizes.join(", ")}>Size: {sizes.slice(0, 3).join(", ")}{sizes.length > 3 ? "…" : ""}</small>}
      </div>
      <button className="btn btn-primary w-100 esh-card-add-button" type="button" disabled={outOfStock} onClick={() => onAdd(product, variant)}>
        {outOfStock ? "Out of stock" : signedIn ? "Add to cart" : "Sign in to add"}
      </button>
    </div>
  </article>;
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
  return <section className="sign-in-prompt"><span className="eyebrow">CUSTOMER ACCOUNT</span><h1>{title}</h1><p>Sign in to see information saved securely to your account.</p><button className="btn btn-primary" type="button" onClick={() => navigate("/?signin=1")}>Sign in to continue</button></section>;
}
