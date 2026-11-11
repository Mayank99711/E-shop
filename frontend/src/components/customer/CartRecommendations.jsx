import { DemoPhoto, demoProductPhoto } from "./DemoMedia.jsx";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { customerApi, resolveMediaUrl } from "../../services/customer/index.js";
import { money } from "../../utils/format.js";
import ProductRating from "./reviews/ProductRating.jsx";

function findAvailableVariant(product) {
  return product.variants?.find(
    (variant) => Number(variant.stock) > 0
  );
}

export function CartRecommendations({ cartItems = [] }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Stable dependency: only reload when cart product IDs change.
  const cartSignature = cartItems
    .map((item) => item.productId)
    .sort()
    .join(",");

  useEffect(() => {
    if (!cartSignature) {
      setProducts([]);
      return;
    }

    let active = true;

    async function loadRecommendations() {
      setLoading(true);

      try {
        const excludedIds = new Set(
          cartSignature.split(",").filter(Boolean)
        );

        const cartProducts = cartItems.map((item) => item.product);
        const categoryIds = [
          ...new Set(
            cartProducts
              .map((product) => product?.category?.id)
              .filter(Boolean)
          ),
        ];

        // Use the existing public catalog API.
        const requests = [
          customerApi.products({
            page: "1",
            limit: "48",
            sort: "newest",
          }),
          ...categoryIds.slice(0, 3).map((categoryId) =>
            customerApi.products({
              categoryId,
              page: "1",
              limit: "48",
              sort: "newest",
            })
          ),
        ];

        const results = await Promise.allSettled(requests);

        const candidates = new Map();

        for (const result of results) {
          if (result.status !== "fulfilled") continue;

          for (const product of result.value.items || []) {
            if (
              !excludedIds.has(product.id) &&
              product.status === "ACTIVE" &&
              product.shop?.status === "ACTIVE" &&
              findAvailableVariant(product)
            ) {
              candidates.set(product.id, product);
            }
          }
        }

        const scores = [...candidates.values()].map((product) => {
          let score = 0;

          for (const cartProduct of cartProducts) {
            if (
              product.category?.id &&
              product.category.id === cartProduct?.category?.id
            ) {
              score += 10;
            } else if (
              product.category?.parentId &&
              product.category.parentId ===
                cartProduct?.category?.parentId
            ) {
              score += 4;
            }

            if (
              product.brand?.id &&
              product.brand.id === cartProduct?.brand?.id
            ) {
              score += 5;
            }

            if (
              product.shop?.id &&
              product.shop.id === cartProduct?.shop?.id
            ) {
              score += 2;
            }
          }

          return { product, score };
        });

        scores.sort(
          (a, b) =>
            b.score - a.score ||
            Number(b.product.averageRating || 0) -
              Number(a.product.averageRating || 0) ||
            a.product.id.localeCompare(b.product.id)
        );

        if (active) {
          setProducts(scores.slice(0, 4).map((item) => item.product));
        }
      } catch {
        if (active) setProducts([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRecommendations();

    return () => {
      active = false;
    };
    // cartSignature changes whenever the cart product selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature]);

  if (!cartSignature || (!loading && products.length === 0)) {
    return null;
  }

  return (
    <section
      className="cart-recommendations"
      aria-labelledby="cart-recommendations-heading"
    >
      <div className="cart-recommendations-header">
        <div>
          <span className="eyebrow">HANDPICKED FOR YOUR CART</span>
          <h2 id="cart-recommendations-heading">
            You May Also Like
          </h2>
          <p>Discover more products that match your selection.</p>
        </div>
      </div>

      {loading && products.length === 0 ? (
        <p role="status">Finding matching products...</p>
      ) : (
        <div className="cart-recommendations-grid">
          {products.map((product) => {
            const variant = findAvailableVariant(product);
            const regularPrice = Number(variant.price);
            const discountPrice = Number(variant.discountPrice);

            const discounted =
              Number.isFinite(discountPrice) &&
              discountPrice > 0 &&
              discountPrice < regularPrice;

            const price = discounted
              ? discountPrice
              : regularPrice;

            const image = product.images?.[0];

            return (
              <article
                className="cart-recommendation-card"
                key={product.id}
              >
                <Link
                  to={`/products/${product.id}`}
                  className="cart-recommendation-image"
                >
                  <DemoPhoto
                    src={image?.url}
                    fallback={demoProductPhoto(product)}
                    alt={product.name}
                  />
                </Link>

                <div className="cart-recommendation-info">
                  <span className="eyebrow">
                    {product.brand?.name ||
                      product.category?.name ||
                      "E-Shop"}
                  </span>

                  <Link
                    to={`/products/${product.id}`}
                    className="cart-recommendation-name"
                  >
                    {product.name}
                  </Link>

                  <Link
                    to={`/products/${product.id}#reviews`}
                    className="product-rating-link"
                  >
                    <ProductRating
                      averageRating={product.averageRating}
                      reviewCount={product.reviewCount}
                    />
                  </Link>

                  <div className="store-price-row">
                    <strong>{money(price)}</strong>
                    {discounted && (
                      <del>{money(regularPrice)}</del>
                    )}
                  </div>

                 <Link
  className="btn w-100 cart-recommendation-view-btn"
  to={`/products/${product.id}`}
>
  View Product
</Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
