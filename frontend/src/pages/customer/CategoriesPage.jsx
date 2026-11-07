import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customerApi } from '../../services/customer/index.js';
import { PageState } from '../../components/customer/StorefrontComponents.jsx';

export function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    customerApi.categories().then((result) => {
      if (!active) return;
      setCategories(Array.isArray(result.items) ? result.items : []);
      setLoading(false);
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const rootCategories = categories.filter((category) => !category.parentId);
  const subcategories = categories.filter((category) => Boolean(category.parentId));

  return (
    <PageState loading={loading} error={error}>
      <section className="catalog-section" aria-labelledby="categories-heading">
        <div className="catalog-title-row">
          <div>
            <span className="eyebrow">BROWSE BY CATEGORY</span>
            <h2 id="categories-heading">Categories</h2>
          </div>
        </div>
        <p className="catalog-section-desc">Shop from independent neighbourhood stores by category.</p>
        {rootCategories.length === 0 ? (
          <div className="store-empty"><span>No categories available</span><p>Check back soon for new categories.</p></div>
        ) : (
          <div className="category-grid">
            {rootCategories.map((category) => {
              const children = subcategories.filter((child) => child.parentId === category.id);
              return (
                <article key={category.id} className="category-card">
                  <Link to={`/?categoryId=${category.id}`} className="category-parent-link">
                    <span className="category-name">{category.name}</span>
                    {children.length > 0 && <span className="category-count">{children.length} {children.length === 1 ? "subcategory" : "subcategories"}</span>}
                  </Link>
                  {children.length > 0 && <nav className="category-subcategories" aria-label={`${category.name} subcategories`}>
                    {children.map((child) => {
                      const filters = new URLSearchParams({ categoryId: category.id, subcategoryId: child.id });
                      return <Link key={child.id} to={`/?${filters.toString()}`}>{child.name}</Link>;
                    })}
                  </nav>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </PageState>
  );
}
