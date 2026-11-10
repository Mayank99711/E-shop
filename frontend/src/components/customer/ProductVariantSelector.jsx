const COLOR_HEX = {
  red: "#dc3545",
  black: "#212529",
  blue: "#2563eb",
  white: "#ffffff",
  green: "#198754",
  yellow: "#facc15",
  pink: "#ec4899",
  grey: "#9ca3af",
  gray: "#9ca3af",
  brown: "#92400e",
  beige: "#d6c5a1",
  navy: "#1e3a8a",
};

function getAttributeValue(variant, attributeName) {
  const match = (variant.values || []).find(
    ({ attribute }) =>
      attribute?.name?.trim().toLowerCase() === attributeName.toLowerCase()
  );

  return match?.value?.value || null;
}

export default function ProductVariantSelector({
  variants = [],
  selectedVariantId,
  onChange,
}) {
  const activeVariants = variants.filter(
    (variant) => variant.isActive !== false
  );

  const selectedVariant =
    activeVariants.find((variant) => variant.id === selectedVariantId) ||
    activeVariants.find((variant) => Number(variant.stock) > 0) ||
    activeVariants[0];

  if (!selectedVariant || activeVariants.length <= 1) return null;

  const colors = [
    ...new Set(
      activeVariants
        .map((variant) => getAttributeValue(variant, "Color"))
        .filter(Boolean)
    ),
  ];

  const sizes = [
    ...new Set(
      activeVariants
        .map((variant) => getAttributeValue(variant, "Size"))
        .filter(Boolean)
    ),
  ];

  const selectedColor = getAttributeValue(selectedVariant, "Color");
  const selectedSize = getAttributeValue(selectedVariant, "Size");

  function chooseVariant(attributeName, value) {
    const matchingVariants = activeVariants.filter(
      (variant) => getAttributeValue(variant, attributeName) === value
    );

    const otherAttribute =
      attributeName === "Color" ? "Size" : "Color";

    const otherSelectedValue =
      otherAttribute === "Color" ? selectedColor : selectedSize;

    const preferred =
      matchingVariants.find(
        (variant) =>
          getAttributeValue(variant, otherAttribute) === otherSelectedValue &&
          Number(variant.stock) > 0
      ) ||
      matchingVariants.find((variant) => Number(variant.stock) > 0) ||
      matchingVariants[0];

    if (preferred) onChange(preferred.id);
  }

  return (
    <div className="esh-variant-options">
      {colors.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <small>
            <strong>Color:</strong> {selectedColor}
          </small>

          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {colors.map((color) => {
              const isSelected = color === selectedColor;
              const available = activeVariants.some(
                (variant) =>
                  getAttributeValue(variant, "Color") === color &&
                  Number(variant.stock) > 0
              );

              return (
                <button
                  key={color}
                  type="button"
                  title={`${color}${available ? "" : " - Out of stock"}`}
                  aria-label={`Choose ${color} color`}
                  aria-pressed={isSelected}
                  onClick={() => chooseVariant("Color", color)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: COLOR_HEX[color.toLowerCase()] || "#d1d5db",
                    border: isSelected
                      ? "3px solid #c0007f"
                      : "2px solid #d1d5db",
                    outline: isSelected ? "1px solid #ffffff" : "none",
                    opacity: available ? 1 : 0.45,
                    cursor: "pointer",
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {sizes.length > 0 && (
        <div>
          <small>
            <strong>Size:</strong> {selectedSize}
          </small>

          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {sizes.map((size) => {
              const isSelected = size === selectedSize;

              const available = activeVariants.some(
                (variant) =>
                  getAttributeValue(variant, "Size") === size &&
                  Number(variant.stock) > 0
              );

              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => chooseVariant("Size", size)}
                  aria-pressed={isSelected}
                  title={available ? `Size ${size}` : `Size ${size} - Out of stock`}
                  style={{
                    minWidth: 36,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: isSelected
                      ? "2px solid #c0007f"
                      : "1px solid #d1d5db",
                    background: isSelected ? "#fff0f8" : "#ffffff",
                    color: "#222222",
                    fontWeight: isSelected ? 700 : 400,
                    opacity: available ? 1 : 0.45,
                    cursor: "pointer",
                  }}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}