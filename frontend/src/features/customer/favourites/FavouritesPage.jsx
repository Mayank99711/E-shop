
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { customerApi } from "../../../services/customer/index.js";
import {
  PageState,
  ProductGrid,
  PageHeading,
  SignInPrompt,
} from "../../../components/customer/StorefrontComponents.jsx";

export function FavouritesPage({
  onFavourite,
  onAdd,
  favouriteIds,
  signedIn,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch wishlist only when customer is signed in
  useEffect(() => {
    if (!signedIn) {
      setItems([]);
      setLoading(false);
      setError("");
      return;
    }

    let active = true;

    setLoading(true);
    setError("");

    customerApi
      .favourites()
      .then(({ items: result }) => {
        if (active) {
          setItems(result || []);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.message || "Unable to load your wishlist."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [signedIn]);

  // Remove product from wishlist
  async function remove(product) {
    const success = await onFavourite(product);

    if (success) {
      setItems((current) =>
        current.filter(
          ({ product: item }) => item.id !== product.id
        )
      );
    }
  }

  // Require customer login
  if (!signedIn) {
    return <SignInPrompt title="Your Wishlist" />;
  }

  return (
    <section className="account-page customer-wishlist-page">
      <PageHeading
        eyebrow="SAVED FOR LATER"
        title="My Wishlist"
        description="All your saved products in one place."
      />

      <PageState loading={loading} error={error}>
        {items.length === 0 ? (
          <div className="store-empty customer-wishlist-empty">
            <span>Your wishlist is empty</span>

            <p>
              Save products you love by clicking the heart icon.
              They'll appear here whenever you need them.
            </p>

            <Link to="/" className="btn btn-primary">
              Explore Products
            </Link>
          </div>
        ) : (
          <ProductGrid
            products={items
              .map(({ product }) => product)
              .filter(Boolean)}
            favouriteIds={favouriteIds}
            signedIn={signedIn}
            onFavourite={remove}
            onAdd={onAdd}
          />
        )}
      </PageState>
    </section>
  );
}
