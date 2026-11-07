
import { Link } from "react-router-dom";
import { resolveMediaUrl } from "../../services/apiClient.js";
import { money } from "../../utils/format.js";
import ProductRating from "./reviews/ProductRating.jsx";

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
              {item.product.images?.[0] ? (
                <img
                  src={resolveMediaUrl(item.product.images[0].url)}
                  alt=""
                />
              ) : (
                "E"
              )}
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
