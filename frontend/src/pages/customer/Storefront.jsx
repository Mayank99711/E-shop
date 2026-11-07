import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Route, Routes, useSearchParams } from "react-router-dom";
import { customerApi } from "../../services/customer/index.js";

const CatalogPage = lazy(() => import('./CatalogPage.jsx').then((module) => ({ default: module.CatalogPage })));
const CategoriesPage = lazy(() => import('./CategoriesPage.jsx').then((module) => ({ default: module.CategoriesPage })));
const ShopsPage = lazy(() => import('./ShopsPage.jsx').then((module) => ({ default: module.ShopsPage })));
const ProductDetails = lazy(() => import('./ProductDetailsPage.jsx').then((module) => ({ default: module.ProductDetails })));
const FavouritesPage = lazy(() => import('./FavouritesPage.jsx').then((module) => ({ default: module.FavouritesPage })));
const CartPage = lazy(() => import('./checkout/CartPage.jsx').then((module) => ({ default: module.CartPage })));
const AddressesPage = lazy(() => import('./AddressesPage.jsx').then((module) => ({ default: module.AddressesPage })));
const OrdersPage = lazy(() => import('./OrdersPage.jsx').then((module) => ({ default: module.OrdersPage })));
const ProfilePage = lazy(() => import('./ProfilePage.jsx').then((module) => ({ default: module.ProfilePage })));

function NavIcon({ name }) {
  const paths = {
    discover: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6.5 9.5V20h11V9.5M10 20v-6h4v6" /></>,
    categories: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    shops: <><path d="M3 10h18l-1.6-5H4.6L3 10Z" /><path d="M5 10v10h14V10M9 20v-6h6v6" /><path d="M3 10a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 3 0" /></>,
    favourites: <path d="M20.5 8.8c0 4.1-8.5 10-8.5 10s-8.5-5.9-8.5-10a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2Z" />,
    cart: <><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.5a2 2 0 0 0 1.9-1.4L21 9H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
    orders: <><path d="M6 4h12v16l-3-2-3 2-3-2-3 2z" /><path d="M9 9h6M9 13h6" /></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export default function Storefront({ user, openSignIn, mobileMenuOpen, onNavigate }) {
  const [favouriteIds, setFavouriteIds] = useState(new Set());
  const [cartCount, setCartCount] = useState(0);
  const [quickCategories, setQuickCategories] = useState([]);
  const [notice, setNotice] = useState("");
  const [headerNavSlot, setHeaderNavSlot] = useState(null);

  useEffect(() => {
    setHeaderNavSlot(document.getElementById("esh-desktop-nav-slot"));
  }, []);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let active = true;
    customerApi.categories().then((result) => {
      if (!active) return;
      setQuickCategories((Array.isArray(result?.items) ? result.items : [])
        .filter((category) => !category.parentId).slice(0, 12));
    }).catch(() => {
      if (active) setQuickCategories([]);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) { setFavouriteIds(new Set()); setCartCount(0); return () => { active = false; }; }
    Promise.all([customerApi.favourites(), customerApi.cart()]).then(([favourites, cart]) => {
      if (!active) return;
      setFavouriteIds(new Set(favourites.items.map(({ product }) => product.id)));
      setCartCount(cart.cart.items.reduce((sum, item) => sum + item.quantity, 0));
    }).catch((error) => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (searchParams.get("signin") === "1") {
      openSignIn();
      const next = new URLSearchParams(searchParams);
      next.delete("signin");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, openSignIn]);

  async function toggleFavourite(product) {
    if (!user) { openSignIn(); return; }
    setNotice("");
    try {
      if (favouriteIds.has(product.id)) {
        await customerApi.removeFavourite(product.id);
        setFavouriteIds((current) => { const next = new Set(current); next.delete(product.id); return next; });
        setNotice("Removed from your wishlist.");
      } else {
        await customerApi.saveFavourite(product.id);
        setFavouriteIds((current) => new Set(current).add(product.id));
        setNotice("Saved to your wishlist.");
      }
      return true;
    } catch (error) { setNotice(error.message); return false; }
  }

  async function addToCart(product, variant, quantity = 1) {
    if (!user) { openSignIn(); return; }
    setNotice("");
    try {
      await customerApi.addCartItem({ variantId: variant.id, quantity });
      setCartCount((value) => value + quantity);
      setNotice(`${product.name} added to your cart.`);
    } catch (error) { setNotice(error.message); }
  }

  function navigationLinks() {
    return <>
      <NavLink to="/" end onClick={onNavigate}><NavIcon name="discover" />Discover</NavLink>
      <Link to="/categories" onClick={onNavigate}><NavIcon name="categories" />Categories</Link>
      <Link to="/shops" onClick={onNavigate}><NavIcon name="shops" />Shops</Link>
      <Link to="/#esh-brands" onClick={onNavigate}>✧ Brands</Link>
      <NavLink to="/wishlist" onClick={onNavigate}><NavIcon name="favourites" />Wishlist{user && <span className="nav-count">{favouriteIds.size}</span>}</NavLink>
      <NavLink to="/cart" onClick={onNavigate}><NavIcon name="cart" />Cart <span className="cart-count">{cartCount}</span></NavLink>
      {user && <NavLink to="/my-orders" onClick={onNavigate}><NavIcon name="orders" />Orders</NavLink>}
    </>;
  }

  return <>
    {headerNavSlot && createPortal(
      <nav className="store-nav-links esh-header-nav-links" aria-label="Customer desktop navigation">
        {navigationLinks()}
      </nav>,
      headerNavSlot
    )}
    <nav className={`store-nav-links esh-below-header-nav ${mobileMenuOpen ? "mobile-open" : ""}`} aria-label="Customer navigation">
      {navigationLinks()}
    </nav>
    {quickCategories.length > 0 && <nav className="market-category-strip" aria-label="Shop by category">
      <Link to="/categories" className="market-category-all">All categories</Link>
      {quickCategories.map((category) => <Link
        key={category.id}
        to={`/?${new URLSearchParams({ categoryId: category.id })}`}
        className={searchParams.get("categoryId") === category.id ? "active" : ""}
        onClick={onNavigate}
      >{category.name}</Link>)}
    </nav>}
    {notice && <div className="store-toast" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}>×</button></div>}
    <Suspense fallback={<div className="store-state" role="status">Loading E-Shop page…</div>}><Routes>
      <Route path="/" element={<CatalogPage favouriteIds={favouriteIds} signedIn={Boolean(user)} onFavourite={toggleFavourite} onAdd={addToCart} />} />
      <Route path="/categories" element={<CategoriesPage />} />
      <Route path="/shops" element={<ShopsPage />} />
      <Route path="/products" element={<CatalogPage favouriteIds={favouriteIds} signedIn={Boolean(user)} onFavourite={toggleFavourite} onAdd={addToCart} />} />
      <Route path="/products/:productId" element={<ProductDetails favouriteIds={favouriteIds} signedIn={Boolean(user)} onFavourite={toggleFavourite} onAdd={addToCart} />} />
      <Route path="/favourites" element={<FavouritesPage onFavourite={toggleFavourite} onAdd={addToCart} favouriteIds={favouriteIds} signedIn={Boolean(user)} />} />
      <Route path="/wishlist" element={<FavouritesPage onFavourite={toggleFavourite} onAdd={addToCart} favouriteIds={favouriteIds} signedIn={Boolean(user)} />} />
      <Route path="/cart" element={<CartPage signedIn={Boolean(user)} onCartChange={setCartCount} onNotice={setNotice} />} />
      <Route path="/checkout" element={<CartPage signedIn={Boolean(user)} onCartChange={setCartCount} onNotice={setNotice} />} />
      <Route path="/addresses" element={<AddressesPage signedIn={Boolean(user)} />} />
      <Route path="/orders" element={<OrdersPage signedIn={Boolean(user)} />} />
      <Route path="/my-orders" element={<OrdersPage signedIn={Boolean(user)} />} />
      <Route path="/orders/:orderId" element={<OrdersPage signedIn={Boolean(user)} />} />
      <Route path="/profile" element={<ProfilePage user={user} signedIn={Boolean(user)} />} />
      <Route path="*" element={<section className="sign-in-prompt"><h1>Page not found</h1><Link to="/">Return to E-Shop</Link></section>} />
    </Routes></Suspense>
    <footer className="market-footer">
      <div className="market-footer-brand">
        <Link className="brand" to="/" aria-label="E-Shop home"><span className="brand-mark">E</span>E-Shop</Link>
        <p>Discover products, brands and independent shops in one convenient marketplace.</p>
      </div>
      <nav className="market-footer-links" aria-label="Marketplace links">
        <strong>Discover</strong>
        <Link to="/">Products</Link>
        <Link to="/categories">Categories</Link>
        <Link to="/shops">Shops</Link>
      </nav>
      <nav className="market-footer-links" aria-label="Customer links">
        <strong>Your E-Shop</strong>
        <Link to="/wishlist">Wishlist</Link>
        <Link to="/cart">Cart</Link>
        {user && <><Link to="/my-orders">Orders</Link><Link to="/profile">Account</Link><Link to="/addresses">Addresses</Link></>}
      </nav>
      <div className="market-footer-bottom"><span>E-Shop marketplace</span><span>Customer experience</span></div>
    </footer>
  </>;
}
