
import { useState } from "react";

export default function ProductDescription({ description = "" }) {
  const [expanded, setExpanded] = useState(false);

  const text = String(description || "").trim();

  if (!text) return null;

  const isLong = text.length > 180;

  return (
    <section className="esh-product-description">
      <h3>Product Description</h3>

      <p
        className={
          isLong && !expanded
            ? "esh-description-collapsed"
            : ""
        }
      >
        {text}
      </p>

      {isLong && (
        <button
          type="button"
          className="esh-description-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Read Less" : "Read More"}
          <span aria-hidden="true">
            {expanded ? " ↑" : " ↓"}
          </span>
        </button>
      )}
    </section>
  );
}
