import { useEffect, useState } from 'react';
import { customerApi } from '../../../services/customer/index.js';
import { PageState, ProductGrid, PageHeading, SignInPrompt } from '../../../components/customer/StorefrontComponents.jsx';

export function FavouritesPage({ onFavourite, onAdd, favouriteIds, signedIn }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    customerApi.favourites().then(({ items: result }) => { if (active) setItems(result); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function remove(product) {
    if (await onFavourite(product)) {
      setItems((current) => current.filter(({ product: item }) => item.id !== product.id));
    }
  }
  if (!signedIn) return <SignInPrompt title="Your Wishlist" />;
  return <section className="account-page"><PageHeading
  eyebrow="SAVED FOR LATER"
  title="My Wishlist"
  description="All your saved products in one place."
/>
    <PageState loading={loading} error={error}><ProductGrid products={items.map(({ product }) => product)} favouriteIds={favouriteIds} signedIn={signedIn} onFavourite={remove} onAdd={onAdd} /></PageState>
  </section>;
}
