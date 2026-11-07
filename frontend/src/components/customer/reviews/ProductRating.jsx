
export default function ProductRating({
  averageRating = 0,
  reviewCount = 0,
  size = "sm",
  showCount = true,
}) {
  const rating = Math.min(5, Math.max(0, Number(averageRating) || 0));
  const count = Math.max(0, Number(reviewCount) || 0);

  if (count === 0) {
    return (
      <span className="product-rating product-rating--empty">
        No reviews yet
      </span>
    );
  }

  return (
    <span
      className={`product-rating product-rating--${size}`}
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars based on ${count} reviews`}
    >
      <span className="product-rating__stars" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={index}
            className="product-rating__star"
            style={{
              background: `linear-gradient(
                90deg,
                #e8a317 ${Math.min(100, Math.max(0, (rating - index) * 100))}%,
                #cbd5e1 ${Math.min(100, Math.max(0, (rating - index) * 100))}%
              )`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            ★
          </span>
        ))}
      </span>
      <strong>{rating.toFixed(1)}</strong>
      {showCount && <span className="product-rating__count">({count})</span>}
    </span>
  );
}
