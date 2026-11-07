import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customerApi } from '../../services/customer/index.js';
import { PageState } from '../../components/customer/StorefrontComponents.jsx';

export function ShopsPage() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    customerApi.shops().then((result) => {
      if (!active) return;
      setShops(Array.isArray(result.items) ? result.items : []);
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <PageState loading={loading} error={error}>
      <section className="catalog-section" aria-labelledby="shops-heading">
        <div className="catalog-title-row">
          <div>
            <span className="eyebrow">DISCOVER THE MARKETPLACE</span>
            <h2 id="shops-heading">Shops</h2>
          </div>
        </div>
        <p className="catalog-section-desc">Browse shops currently listed in the marketplace.</p>
        {shops.length === 0 ? (
          <div className="store-empty"><span>No shops available</span><p>Check back soon for marketplace shops.</p></div>
        ) : (
          <div className="shop-directory-grid">
            {shops.map((shop) => (
              <article className="shop-directory-card" key={shop.id}>
                <span className="shop-directory-mark" aria-hidden="true">{shop.name?.trim().charAt(0).toUpperCase() || "S"}</span>
                <div className="shop-directory-copy">
                  <h3>{shop.name}</h3>
                  <Link to={`/?${new URLSearchParams({ shopId: shop.id }).toString()}`}>Browse products <span aria-hidden="true">→</span></Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageState>
  );
}
