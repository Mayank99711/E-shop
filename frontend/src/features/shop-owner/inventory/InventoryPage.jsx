import { useMemo, useState } from "react";

export default function InventoryPage({ products }) {
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState("");
  const variants = useMemo(() => products.flatMap((product) =>
    (product.variants || []).map((variant) => ({
      ...variant,
      productName: product.name,
      productStatus: product.status,
      options: (variant.values || [])
        .map(({ attribute, value }) => `${attribute.name}: ${value.value}`)
        .join(", ") || "Standard",
    })),
  ), [products]);
  const filteredVariants = variants.filter((variant) => {
    const matchesQuery = !query.trim() ||
      `${variant.productName} ${variant.sku} ${variant.options}`.toLowerCase().includes(query.trim().toLowerCase());
    const inStock = Number(variant.stock) > 0;
    return matchesQuery && (!availability || (availability === "IN_STOCK" ? inStock : !inStock));
  });

  return (
    <section className="workspace-card">
      <div className="section-heading">
        <div>
          <h2>Shop inventory</h2>
          <p className="muted-copy">Current available stock for your product variants.</p>
        </div>
      </div>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <label className="visually-hidden" htmlFor="owner-inventory-search">Search inventory</label>
        <input id="owner-inventory-search" className="form-control" type="search" placeholder="Search product, SKU, or variant" value={query} onChange={(event) => setQuery(event.target.value)} style={{ maxWidth: 340 }} />
        <label className="visually-hidden" htmlFor="owner-inventory-availability">Filter by availability</label>
        <select id="owner-inventory-availability" className="form-select" value={availability} onChange={(event) => setAvailability(event.target.value)} style={{ maxWidth: 190 }}>
          <option value="">All stock states</option>
          <option value="IN_STOCK">In stock</option>
          <option value="OUT_OF_STOCK">Out of stock</option>
        </select>
      </div>
      {filteredVariants.length === 0 ? (
        <p className="muted-copy">{variants.length ? "No inventory items match these filters." : "No product variants are available in your inventory."}</p>
      ) : (
        <div className="employee-table-wrap">
          <table className="employee-table" aria-label="Shop inventory">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">SKU</th>
                <th scope="col">Variant</th>
                <th scope="col">Available stock</th>
                <th scope="col">Product status</th>
                <th scope="col">Variant status</th>
              </tr>
            </thead>
            <tbody>
              {filteredVariants.map((variant) => (
                <tr key={variant.id}>
                  <td>{variant.productName}</td>
                  <td>{variant.sku}</td>
                  <td>{variant.options}</td>
                  <td><strong>{variant.stock}</strong></td>
                  <td><span className={`status-pill ${variant.productStatus.toLowerCase()}`}>{variant.productStatus}</span></td>
                  <td><span className={`status-pill ${variant.isActive ? "active" : "inactive"}`}>{variant.isActive ? "ACTIVE" : "INACTIVE"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
