
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  customerApi,
  resolveMediaUrl,
} from "../../services/customer/index.js";
import { PageState } from "../../components/customer/StorefrontComponents.jsx";
import ProductRating from "../../components/customer/reviews/ProductRating.jsx";
import { money } from "../../utils/format.js";

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
                style={{ width: `${percentage}%` }}
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

        setVariantId(inStock?.id || result.variants[0]?.id || "");
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

  const variant = product?.variants.find(
    (item) => item.id === variantId
  );

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
              {product.images?.length ? (
                product.images.map((image) => (
                  <img
                    src={resolveMediaUrl(image.url)}
                    alt={product.name}
                    key={image.id}
                    onError={(event) =>
                      event.currentTarget.classList.add(
                        "image-unavailable"
                      )
                    }
                  />
                ))
              ) : (
                <div
                  className="detail-image-placeholder"
                  aria-hidden="true"
                >
                  E
                </div>
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

              {product.variants.length > 1 && (
                <label className="detail-option">
                  Choose an option
                  <select
                    value={variantId}
                    onChange={(event) => {
                      setVariantId(event.target.value);
                      setQuantity(1);
                    }}
                  >
                    {product.variants.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.values
                          .map(
                            ({ attribute, value }) =>
                              `${attribute.name}: ${value.value}`
                          )
                          .join(" · ") || item.sku}
                        {" · "}
                        {item.stock > 0
                          ? `${item.stock} available`
                          : "Out of stock"}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {variant && (
                <>
                  <div className="detail-price">
                    {money(
                      variant.discountPrice || variant.price
                    )}
                    {variant.discountPrice && (
                      <del>{money(variant.price)}</del>
                    )}
                  </div>

                  <p
                    className={
                      variant.stock > 0
                        ? "availability available"
                        : "availability unavailable"
                    }
                  >
                    {variant.stock > 0
                      ? `${variant.stock} available`
                      : "Currently out of stock"}
                  </p>

                  {variant.stock > 0 && (
                    <div className="detail-buy-row">
                      <label>
                        Qty
                        <input
                          type="number"
                          min="1"
                          max={Math.min(variant.stock, 100)}
                          value={quantity}
                          onChange={(event) =>
                            setQuantity(
                              Math.max(1, Number(event.target.value))
                            )
                          }
                        />
                      </label>

                      <button
                        className="btn btn-primary btn-lg"
                        type="button"
                        disabled={!signedIn}
                        onClick={() =>
                          onAdd(product, variant, quantity)
                        }
                      >
                        {signedIn
                          ? "Add to cart"
                          : "Sign in to shop"}
                      </button>
                    </div>
                  )}
                </>
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
                      disabled={reviewsPage <= 1 || reviewsLoading}
                      onClick={() =>
                        setReviewsPage((page) => page - 1)
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
                        setReviewsPage((page) => page + 1)
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
