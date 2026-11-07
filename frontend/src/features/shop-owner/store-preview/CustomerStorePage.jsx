import { resolveMediaUrl } from '../../../services/shopOwner/index.js';

export function CustomerStorePreview({ dashboard, products = [] }) {
  const shop = dashboard?.shop || {};
  const publishedProducts = (products || []).filter((product) => product.status === 'ACTIVE');
  const shopName = shop.name || 'My Shop';
  const shopCategory = shop.shopCategory?.name || shop.category?.name || 'Shop';
  const logo = shop.logoUrl;
  const status = shop.status || 'PENDING';

  return (
    <section className="workspace-card customer-store-preview">
      <div className="workspace-card-heading">
        <div>
          <h2>Shop Overview</h2>
          <p>Preview how your shop information and published products appear to customers.</p>
        </div>
        <div className="page-actions">
          <a className="btn btn-outline-primary" href="/" target="_blank" rel="noreferrer">Visit Marketplace</a>
        </div>
      </div>

      <div className="store-overview-grid">
        <div className="store-overview-card store-overview-brand">
          {logo ? <img className="store-logo" src={resolveMediaUrl(logo)} alt={shopName} /> : <div className="store-logo store-logo-fallback">E</div>}
          <div>
            <h3>{shopName}</h3>
            <p>{shopCategory}</p>
            {shop.businessAddress && <p className="store-address">{shop.businessAddress}</p>}
          </div>
        </div>
        <div className="store-overview-card"><span>Total products</span><strong>{products.length}</strong></div>
        <div className="store-overview-card"><span>Published products</span><strong>{publishedProducts.length}</strong></div>
        <div className="store-overview-card"><span>Shop status</span><strong className={`status-pill ${status.toLowerCase()}`}>{status}</strong></div>
      </div>

      <div className="store-section-heading">
        <h3>Published Products</h3>
        <span>{publishedProducts.length} visible</span>
      </div>

      {!publishedProducts.length ? (
        <div className="empty-state">No published products are available in your customer store yet.</div>
      ) : (
        <div className="store-product-grid">
          {publishedProducts.map((product) => {
            const variant = product.variants?.[0];
            const price = variant?.discountPrice || variant?.price;
            return (
              <article className="store-product-card" key={product.id}>
                <div className="store-product-image">
                  {product.images?.[0]?.url ? <img src={resolveMediaUrl(product.images[0].url)} alt={product.name} /> : <span>E</span>}
                </div>
                <div className="store-product-body">
                  <h4>{product.name}</h4>
                  <p>{product.description}</p>
                  <div className="store-product-meta">
                    <strong>{price === undefined ? 'Unavailable' : `Rs. ${price}`}</strong>
                    <span className={`stock-badge ${Number(variant?.stock ?? 0) > 0 ? 'in-stock' : 'out-of-stock'}`}>{variant?.stock ?? 0} in stock</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
