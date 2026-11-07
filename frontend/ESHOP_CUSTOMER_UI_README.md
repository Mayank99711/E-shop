# E-Shop Customer Portal — A + D Hybrid UI

## What's included
- Customer-only JSX redesign for the catalog homepage and shopping discovery sections.
- New magenta/violet scoped stylesheet: `src/pages/customer/eshop-hybrid.css`.
- Responsive desktop product sidebar and mobile slide-out filter drawer.
- Existing customer endpoints, auth, wishlist, cart, checkout, orders, profiles, reviews and routing unchanged.
- Homepage shop/brand/product imagery comes from existing backend API responses (no invented ratings, offers or verification badges).

## Install
1. Backup your existing project or commit work to Git.
2. Copy the files from this archive into the existing `frontend` folder, overwriting only matching paths.
3. In `frontend`, run `npm install` (if needed) then `npm run build`.
4. Run `npm run dev`, open `http://localhost:5173/`, and check desktop and mobile.
5. Do not copy the archive's `src` folder directly into `backend`.

## Testing
- Sign in/out, search by query, category/subcategory/brand/shop, sorting, product detail, favourites, add-to-cart, cart, checkout, order history and profile.
- Sidebar: category, brand, shop filters use the existing catalog API. Price, discount, rating and in-stock controls filter products loaded on the current page only; the UI discloses this limitation.
- Product pagination uses the existing backend page endpoint; the next-page action is labeled "Load more products" but navigates to the next page, rather than cumulatively appending previous pages.
- Mobile: menu toggle, search, filter drawer open/close, tap targets, product cards.

## Limitations
- No source image library was supplied beyond project product images, so the feature hero uses a product image from the API, rather than any licensed fashion hero banner.
- Promotions are generic and no discount claims are invented; product discount badges are calculated only from valid API variant prices.
- No production build could be executed in the authoring environment because dependency installation was unavailable. Run the Vite build locally.
