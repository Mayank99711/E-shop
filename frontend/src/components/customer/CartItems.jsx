
import { Link } from "react-router-dom";
import { resolveMediaUrl } from "../../services/apiClient.js";
import { money } from "../../utils/format.js";
import { DemoPhoto, demoProductPhoto } from "./DemoMedia.jsx";
import ProductRating from "./reviews/ProductRating.jsx";

function getCartVariantImage(item) {
  const images = item.product?.images || [];

  const colorEntry = (item.variant?.values || []).find(
    ({ attribute }) =>
      attribute?.name?.trim().toLowerCase() === "color"
  );

  const colorValueId = colorEntry?.value?.id;

  if (colorValueId) {
    const matchingImage = images.find(
      (image) => image.colorValueId === colorValueId
    );

    if (matchingImage) return matchingImage;
  }

  return images.find((image) => !image.colorValueId) || images[0] || null;
}

export function CartItems({ items, busy, update }) {
  return (
    <div className="cart-items">
      {items.map((item) => {
        const unitPrice = Number(
          item.variant.discountPrice || item.variant.price
        );

        return (
          <article className="cart-row" key={item.id}>
            <Link
              to={`/products/${item.product.id}`}
              className="cart-thumb"
            >
              <DemoPhoto
                src={getCartVariantImage(item)?.url}
                fallback={demoProductPhoto(item.product)}
                alt={`${item.product.name} product image`}
              />
            </Link>

            <div className="cart-item-copy">
              <Link to={`/products/${item.product.id}`}>
                {item.product.name}
              </Link>

              {/* Product rating */}
              <Link
                to={`/products/${item.product.id}#reviews`}
                className="product-rating-link cart-product-rating"
                aria-label={`View reviews for ${item.product.name}`}
              >
                <ProductRating
                  averageRating={item.product.averageRating}
                  reviewCount={item.product.reviewCount}
                  size="sm"
                />
              </Link>

              <span>
                {item.product.shop.name} · {item.variant.sku}
              </span>

              {!item.available && (
                <strong className="availability unavailable">
                  No longer available in this quantity
                </strong>
              )}

              <div className="cart-controls">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={busy}
                  onClick={() => update(item, item.quantity - 1)}
                >
                  −
                </button>

                <span>{item.quantity}</span>

                <button
                  type="button"
                  aria-label="Increase quantity"
                  disabled={
                    busy ||
                    item.quantity >= Math.min(item.variant.stock, 100)
                  }
                  onClick={() => update(item, item.quantity + 1)}
                >
                  +
                </button>

                <button
                  type="button"
                  className="remove-link"
                  disabled={busy}
                  onClick={() => update(item, 0)}
                >
                  Remove
                </button>
              </div>
            </div>

            <strong className="cart-line-price">
              {money(unitPrice * item.quantity)}
            </strong>
          </article>
        );
      })}
    </div>
  );
}
