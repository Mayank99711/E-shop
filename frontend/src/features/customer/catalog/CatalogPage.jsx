import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { customerApi, resolveMediaUrl } from "../../../services/customer/index.js";
import {
  PageState,
  ProductGrid,
  ProductGridSkeleton,
} from "../../../components/customer/StorefrontComponents.jsx";

const formatNumber = (value) => Number(value || 0).toLocaleString("en-IN");
const getPrice = (product) => {
  const variant =
    product.variants?.find((item) => item.stock > 0) || product.variants?.[0];
  if (!variant) return null;
  const standard = Number(variant.price);
  const discounted = Number(variant.discountPrice);
  return discounted > 0 && discounted < standard ? discounted : standard;
};
const getDiscount = (product) => {
  const variant =
    product.variants?.find((item) => item.stock > 0) || product.variants?.[0];
  const price = Number(variant?.price);
  const discount = Number(variant?.discountPrice);
  return price > 0 && discount > 0 && discount < price
    ? ((price - discount) / price) * 100
    : 0;
};
const available = (product) =>
  product.status === "ACTIVE" &&
  product.shop?.status === "ACTIVE" &&
  product.variants?.some((item) => item.stock > 0);
const categoryIcon = (name) => {
  const value = name.toLowerCase();
  if (/women|lady|dress|frock|kurti|saree/.test(value)) return "✿";
  if (/men|shirt|t-shirt|gents/.test(value)) return "♟";
  if (/beauty|makeup|care/.test(value)) return "✧";
  if (/shoe|foot/.test(value)) return "◈";
  if (/electronic|mobile|tech/.test(value)) return "⌘";
  if (/home|kitchen/.test(value)) return "⌂";
  return "✦";
};

function SectionTitle({ title, subtitle, to, action = "View all" }) {
  return (
    <div className="esh-section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {to && (
        <Link to={to}>
          {action} <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}

function FeaturedShops({ shops, products }) {
  if (!shops.length) return null;
  return (
    <section className="esh-home-section" aria-labelledby="esh-shops-title">
      <SectionTitle
        title="Featured Shops"
        subtitle="Explore sellers across the E-Shop marketplace"
        to="/shops"
        action="Explore shops"
      />
      <div className="esh-shop-grid">
        {shops.slice(0, 6).map((shop) => {
          const shopProduct = products.find(
            (product) => product.shop?.id === shop.id && product.images?.[0],
          );
          return (
            <Link
              key={shop.id}
              className="esh-shop-card"
              to={`/?${new URLSearchParams({ shopId: shop.id })}#products-for-you`}
            >
              <div className="esh-shop-photo">
                {shopProduct?.images?.[0] ? (
                  <img
                    src={resolveMediaUrl(shopProduct.images[0].url)}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span aria-hidden="true">
                    {shop.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="esh-shop-identity">
                <span>{shop.name.slice(0, 1).toUpperCase()}</span>
                <strong>{shop.name}</strong>
              </div>
              <span className="esh-shop-action">Browse products →</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Filters({
  categories,
  brands,
  shops,
  categoryId,
  subcategoryId,
  brandId,
  shopId,
  priceMax,
  setPriceMax,
  minDiscount,
  setMinDiscount,
  minRating,
  setMinRating,
  stockOnly,
  setStockOnly,
  updateFilters,
  clearFilters,
}) {
  const rootCategories = categories.filter((category) => !category.parentId);
  const subcategories = categories.filter(
    (category) =>
      category.parentId && (!categoryId || category.parentId === categoryId),
  );
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const [categorySearch, setCategorySearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  return (
    <div className="esh-filter-content">
      <div className="esh-filter-heading">
        <h3>Filters</h3>
        <button type="button" onClick={clearFilters}>
          Clear all
        </button>
      </div>
      <details open className="esh-filter-group">
        <summary>Category</summary>
        <input
          className="esh-filter-search"
          aria-label="Search categories"
          placeholder="Search category..."
          value={categorySearch}
          onChange={(event) => setCategorySearch(event.target.value)}
        />
        <div className="esh-filter-options">
          <label>
            <input
              type="radio"
              name="esh-category"
               
              checked={!categoryId}
              onChange={() =>
                updateFilters({ categoryId: "", subcategoryId: "" })
              }
            />{" "}
            All categories
          </label>
          {rootCategories
            .filter((category) =>
              category.name
                .toLowerCase()
                .includes(categorySearch.toLowerCase()),
            )
            .map((category) => (
              <label key={category.id}>
                <input
                  type="radio"
                  name="esh-category"
                  value={category.id}
                  checked={categoryId === category.id}
                  onChange={() =>
                    updateFilters({
                      categoryId: category.id,
                      subcategoryId: "",
                    })
                  }
                />{" "}
                {category.name}
              </label>
            ))}
        </div>
      </details>
      {subcategories.length > 0 && (
        <details open className="esh-filter-group">
          <summary>Subcategory</summary>
          <select
            aria-label="Filter by subcategory"
            value={subcategoryId}
            onChange={(event) =>
              updateFilters({
                subcategoryId: event.target.value,
                categoryId:
                  categoryById.get(event.target.value)?.parentId || categoryId,
              })
            }
          >
            <option value="">All subcategories</option>
            {subcategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </details>
      )}
      {brands.length > 0 && (
        <details open className="esh-filter-group">
          <summary>Brand</summary>
          <input
            className="esh-filter-search"
            aria-label="Search brands"
            placeholder="Search brand..."
            value={brandSearch}
            onChange={(event) => setBrandSearch(event.target.value)}
          />
          <div className="esh-filter-options">
            <label>
              <input
                type="radio"
                name="esh-brand"
                checked={!brandId}
                onChange={() => updateFilters({ brandId: "" })}
              />{" "}
              All brands
            </label>
            {brands
              .filter((brand) =>
                brand.name.toLowerCase().includes(brandSearch.toLowerCase()),
              )
              .map((brand) => (
                <label key={brand.id}>
                  <input
                    type="radio"
                    name="esh-brand"
                    checked={brandId === brand.id}
                    onChange={() => updateFilters({ brandId: brand.id })}
                  />{" "}
                  {brand.name}
                </label>
              ))}
          </div>
        </details>
      )}
      {shops.length > 0 && (
        <details className="esh-filter-group">
          <summary>Shop</summary>
          <select
            aria-label="Filter by shop"
            value={shopId}
            onChange={(event) => updateFilters({ shopId: event.target.value })}
          >
            <option value="">All shops</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        </details>
      )}
      <details open className="esh-filter-group">
        <summary>Price Range</summary>
        <label className="esh-filter-hint" htmlFor="esh-price">
          Maximum ₹{formatNumber(priceMax)}
        </label>
        <input
          id="esh-price"
          className="esh-price-slider"
          type="range"
          min="500"
          max="50000"
          step="500"
          value={priceMax}
          onChange={(event) => setPriceMax(Number(event.target.value))}
        />
        <div className="esh-range-labels">
          <span>₹0</span>
          <span>₹50,000+</span>
        </div>
      </details>
      <details open className="esh-filter-group">
        <summary>Discount</summary>
        <div className="esh-filter-options">
          {[0, 10, 20, 30, 40, 50].map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="esh-discount"
                checked={minDiscount === value}
                onChange={() => setMinDiscount(value)}
              />
              {value === 0 ? "Any discount" : `${value}% or more`}
            </label>
          ))}
        </div>
      </details>
      <details open className="esh-filter-group">
        <summary>Customer Rating</summary>
        <div className="esh-filter-options">
          {[0, 4, 3].map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="esh-rating"
                checked={minRating === value}
                onChange={() => setMinRating(value)}
              />
              {value === 0 ? "Any rating" : `★ ${value}.0 & above`}
            </label>
          ))}
        </div>
      </details>
      <details open className="esh-filter-group">
        <summary>Availability</summary>
        <label className="esh-filter-check">
          <input
            type="checkbox"
            checked={stockOnly}
            onChange={(event) => setStockOnly(event.target.checked)}
          />{" "}
          In stock only
        </label>
      </details>
      <p className="esh-filter-note">
        Price, discount, rating and availability refine products loaded on this
        page; category, brand and shop filters query the catalog.
      </p>
    </div>
  );
}

export function CatalogPage({ favouriteIds, signedIn, onFavourite, onAdd }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [shops, setShops] = useState([]);
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [mobileFilters, setMobileFilters] = useState(false);
  const [priceMax, setPriceMax] = useState(50000);
  const [minDiscount, setMinDiscount] = useState(0);
  const [minRating, setMinRating] = useState(0);
  const [stockOnly, setStockOnly] = useState(false);
  const [heroSlide, setHeroSlide] = useState(0);
  const query = searchParams.get("q") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const brandId = searchParams.get("brandId") || "";
  const shopId = searchParams.get("shopId") || "";
  const sort = searchParams.get("sort") || "newest";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const subcategoryId = searchParams.get("subcategoryId") || "";
  const isHome =
    !query &&
    !categoryId &&
    !brandId &&
    !shopId &&
    !subcategoryId &&
    page === 1;

  useEffect(() => {
    let active = true;
    Promise.all([
      customerApi.categories(),
      customerApi.brands(),
      customerApi.shops(),
    ])
      .then(([c, b, s]) => {
        if (!active) return;
        setCategories(Array.isArray(c?.items) ? c.items : []);
        setBrands(Array.isArray(b?.items) ? b.items : []);
        setShops(Array.isArray(s?.items) ? s.items : []);
      })
      .catch((reason) => {
        if (active) setOptionsError(reason.message);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    customerApi
      .products(
        {
          ...(query ? { q: query } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(subcategoryId ? { subcategoryId } : {}),
          ...(brandId ? { brandId } : {}),
          ...(shopId ? { shopId } : {}),
          sort,
          page: String(page),
          limit: "24",
        },
        { signal: controller.signal },
      )
      .then((result) => {
        if (active) setPageData(result);
      })
      .catch((reason) => {
        if (active && reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [query, categoryId, subcategoryId, brandId, shopId, sort, page]);

  function updateFilters(values) {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    if (!Object.hasOwn(values, "page")) next.delete("page");
    setSearchParams(next);
  }
  function clearFilters() {
    setPriceMax(50000);
    setMinDiscount(0);
    setMinRating(0);
    setStockOnly(false);
    setSearchParams(new URLSearchParams());
  }

  const products = Array.isArray(pageData?.items) ? pageData.items : [];
  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        const price = getPrice(product);
        return (
          (price === null || price <= priceMax) &&
          getDiscount(product) >= minDiscount &&
          (!minRating ||
            (Number(product.reviewCount) > 0 &&
              Number(product.averageRating) >= minRating)) &&
          (!stockOnly || available(product))
        );
      }),
    [products, priceMax, minDiscount, minRating, stockOnly],
  );
  const rootCategories = categories.filter((category) => !category.parentId);
  const heroProduct = products.find((product) => product.images?.[0]);
  const spotlightProducts = products
    .filter((product) => product.images?.[0])
    .slice(0, 3);
  const heroItem =
    spotlightProducts[heroSlide % Math.max(spotlightProducts.length, 1)] ||
    heroProduct;
  const filterProps = {
    categories,
    brands,
    shops,
    categoryId,
    subcategoryId,
    brandId,
    shopId,
    priceMax,
    setPriceMax,
    minDiscount,
    setMinDiscount,
    minRating,
    setMinRating,
    stockOnly,
    setStockOnly,
    updateFilters,
    clearFilters,
  };
  return (
    <>
      {isHome && (
        <>
          <section className="esh-home-hero" aria-label="Explore E-Shop">
            <div className="esh-hero-copy">
              <span className="esh-overline">DISCOVER E-SHOP COLLECTIONS</span>
              <h1>
                Find your next <em>favourite.</em>
              </h1>
              <p>
                Discover styles, essentials and great products from independent
                shops across our marketplace.
              </p>
              <div className="esh-hero-actions">
                <a href="#products-for-you" className="esh-main-cta">
                  Shop now →
                </a>
                <Link to="/shops" className="esh-outline-cta">
                  Explore shops
                </Link>
              </div>
            </div>
            <div className="esh-hero-visual">
              {heroItem?.images?.[0] ? (
                <img
                  src={resolveMediaUrl(heroItem.images[0].url)}
                  alt={heroItem.name}
                />
              ) : (
                <div className="esh-hero-monogram" aria-hidden="true">
                  E<span>shop</span>
                </div>
              )}
              {spotlightProducts.length > 1 && (
                <div className="esh-hero-dots">
                  {spotlightProducts.map((product, index) => (
                    <button
                      key={product.id}
                      type="button"
                      aria-label={`Show featured product ${index + 1}`}
                      aria-pressed={
                        index === heroSlide % spotlightProducts.length
                      }
                      onClick={() => setHeroSlide(index)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
          {rootCategories.length > 0 && (
            <section className="esh-home-section">
              <SectionTitle
                title="Shop by Category"
                subtitle="Explore your kind of shopping"
                to="/categories"
                action="All categories"
              />
              <div className="esh-category-carousel">
                {rootCategories.slice(0, 12).map((category, index) => (
                  <Link
                    key={category.id}
                    className="esh-category-tile"
                    to={`/?${new URLSearchParams({ categoryId: category.id })}#products-for-you`}
                  >
                    <span
                      className={`esh-category-symbol esh-tone-${index % 6}`}
                    >
                      {category.iconUrl || category.imageUrl ? (
                        <img
                          src={resolveMediaUrl(
                            category.iconUrl || category.imageUrl,
                          )}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        categoryIcon(category.name)
                      )}
                    </span>
                    <span>{category.name}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="esh-editorial-banner">
            <div>
              <span>CURATED FOR YOUR EVERYDAY</span>
              <h2>
                More to explore.
                <br />
                More to love.
              </h2>
              <p>Products, styles and essentials from shops on E-Shop.</p>
              <a href="#products-for-you">Discover products →</a>
            </div>
            <div className="esh-editorial-art" aria-hidden="true">
              <span>✧</span>
              <span>✦</span>
              <span>✧</span>
            </div>
          </section>
          <FeaturedShops shops={shops} products={products} />
          {brands.length > 0 && (
            <section id="esh-brands" className="esh-home-section">
              <SectionTitle
                title="Explore Brands"
                subtitle="Brands currently available in our catalog"
              />
              <div className="esh-brand-strip">
                {brands.slice(0, 12).map((brand) => (
                  <Link
                    key={brand.id}
                    to={`/?${new URLSearchParams({ brandId: brand.id })}#products-for-you`}
                  >
                    <span className="esh-brand-logo-circle">
                      {brand.logoUrl ? (
                        <img
                          src={resolveMediaUrl(brand.logoUrl)}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        "✦"
                      )}
                    </span>
                    <span className="esh-brand-name">{brand.name}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <section
        className="esh-home-section esh-products-section"
        id="products-for-you"
        aria-labelledby="catalog-heading"
      >
        <div className="esh-section-heading esh-products-title">
          <div>
            <h2 id="catalog-heading">
              {query ? `Results for “${query}”` : "Products For You"}
            </h2>
            <p>Explore products from E-Shop sellers</p>
          </div>
          <button
            type="button"
            className="esh-mobile-filter-toggle"
            onClick={() => setMobileFilters(true)}
          >
            ☷ Filters
          </button>
        </div>
        {optionsError && (
          <p className="esh-inline-message" role="status">
            Some filters are unavailable: {optionsError}
          </p>
        )}
        <div className="esh-products-layout">
          <aside
            className={`esh-filter-sidebar ${mobileFilters ? "esh-filter-open" : ""}`}
            aria-label="Product filters"
          >
            <div className="esh-mobile-filter-head">
              <strong>Filter products</strong>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setMobileFilters(false)}
              >
                ×
              </button>
            </div>
            <Filters {...filterProps} />
            <button
              type="button"
              className="esh-mobile-apply"
              onClick={() => setMobileFilters(false)}
            >
              Show products
            </button>
          </aside>
          {mobileFilters && (
            <button
              type="button"
              className="esh-filter-backdrop"
              aria-label="Close filters"
              onClick={() => setMobileFilters(false)}
            />
          )}
          <div className="esh-products-main">
            <div className="esh-product-toolbar">
              <span aria-live="polite">
                {loading
                  ? "Finding products…"
                  : `${formatNumber(pageData?.total)} products · ${visibleProducts.length} shown on this page`}
              </span>
              <label>
                Sort by{" "}
                <select
                  value={sort}
                  onChange={(event) =>
                    updateFilters({ sort: event.target.value })
                  }
                >
                  <option value="newest">Recently added</option>
                  <option value="name_asc">Name: A–Z</option>
                  <option value="name_desc">Name: Z–A</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </label>
            </div>
            {loading ? (
              <ProductGridSkeleton />
            ) : (
              <PageState loading={false} error={error}>
                <ProductGrid
                  products={visibleProducts}
                  favouriteIds={favouriteIds}
                  signedIn={signedIn}
                  onFavourite={onFavourite}
                  onAdd={onAdd}
                />
                {pageData?.pages > 1 && (
                  <nav
                    className="esh-page-navigation"
                    aria-label="Product pages"
                  >
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => updateFilters({ page: String(page - 1) })}
                    >
                      ← Previous
                    </button>
                    <span>
                      Page {page} of {pageData.pages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= pageData.pages}
                      onClick={() => updateFilters({ page: String(page + 1) })}
                    >
                      Load more products →
                    </button>
                  </nav>
                )}
              </PageState>
            )}
          </div>
        </div>
      </section>
      {isHome && (
        <>
          <section className="esh-trust-row">
            <div>
              <span>♧</span>
              <strong>Browse with confidence</strong>
              <small>Explore marketplace shops</small>
            </div>
            <div>
              <span>♡</span>
              <strong>Your favourites</strong>
              <small>Save items you love</small>
            </div>
            <div>
              <span>◈</span>
              <strong>Easy product discovery</strong>
              <small>Find the right fit</small>
            </div>
            <div>
              <span>✧</span>
              <strong>All in one place</strong>
              <small>Manage your orders</small>
            </div>
          </section>
          <section className="esh-discovery-copy">
            <h2>Discover a world of everyday essentials</h2>
            <p>
              E-Shop brings together products from different sellers in one
              convenient marketplace. Browse categories, compare product options
              and find shops you love.
            </p>
            <details>
              <summary>Explore products and collections</summary>
              <p>
                Find clothing, accessories and other products based on the
                categories available in our catalog.
              </p>
              <Link to="/categories">Explore categories →</Link>
            </details>
            <details>
              <summary>Shop from marketplace sellers</summary>
              <p>
                Visit shop listings and view products offered by each
                participating seller.
              </p>
              <Link to="/shops">Explore shops →</Link>
            </details>
          </section>
        </>
      )}
    </>
  );
}
