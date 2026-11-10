import productImageCredits from "../../data/productImageCredits.json";

const creditsByUrl = new Map(
  productImageCredits.map((credit) => [credit.url, credit])
);

export default function ProductImageAttribution({
  imageUrl,
  compact = false,
}) {
  const credit = creditsByUrl.get(imageUrl);

  if (!credit) return null;

  return (
    <div
      className="product-image-attribution"
      style={{
        fontSize: compact ? "10px" : "12px",
        lineHeight: 1.5,
        color: "var(--text-muted, #666)",
        marginTop: "6px",
      }}
    >
      Photo: {credit.author}{" | "}
      <a
        href={credit.sourcePage}
        target="_blank"
        rel="noopener noreferrer"
      >
        Source
      </a>
      {" | "}
      <a
        href={credit.licenseUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {credit.license}
      </a>

      {!compact && (
        <div>
          Illustrative demo photo; not an official branded product image.
        </div>
      )}
    </div>
  );
}