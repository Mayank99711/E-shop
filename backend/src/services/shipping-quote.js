// Server-authoritative fixed-slab delivery pricing. Product weight never comes from the browser.
// Route distance comes from Google Routes API. Do not silently turn missing quotes into 'Free'.
const shippingError = (status, code, message) => Object.assign(new Error(message), { status, code });
const currency = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const numberSetting = (key, defaultValue) => {
  const raw = process.env[key];
  const n = raw === undefined || raw === '' ? defaultValue : Number(raw);
  if (!Number.isFinite(n) || n < 0) throw shippingError(500, 'SHIPPING_CONFIG_INVALID', `Invalid ${key}`);
  return n;
};
const cachedRoutes = new Map();
const fullAddress = (fields) => fields.filter(Boolean).map(v => String(v).trim()).filter(Boolean).join(', ');
function localDemoDistanceKm() {
  if ((process.env.NODE_ENV || 'development') !== 'development' || process.env.SHIPPING_LOCAL_DEMO_MODE !== 'true') return null;
  const raw = process.env.SHIPPING_LOCAL_DEMO_DISTANCE_KM ?? '8';
  const km = Number(raw);
  if (!Number.isFinite(km) || km < 0) throw shippingError(500, 'SHIPPING_DEMO_DISTANCE_INVALID', 'Local demo shipping distance must be a non-negative number.');
  return km;
}
async function getDrivingDistanceKm(shop, delivery) {
  const demoDistance = localDemoDistanceKm();
  if (!shop.businessAddress || !shop.city || !shop.state || !shop.pinCode) {
    throw shippingError(409, 'SHOP_PICKUP_ADDRESS_REQUIRED', 'Shop pickup address must be completed before checkout.');
  }
  if (!delivery?.line1 || !delivery.city || !delivery.region || !delivery.postalCode) {
    throw shippingError(400, 'DELIVERY_ADDRESS_INCOMPLETE', 'Please complete your delivery address.');
  }
  // Explicit, development-only route simulation. Never used in production or test environments.
  // All existing address, stock, weight, delivery-radius and fee rules still apply.
  if (demoDistance !== null) return { km: demoDistance, demo: true };
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw shippingError(503, 'SHIPPING_ROUTING_NOT_CONFIGURED', 'Delivery pricing is temporarily unavailable.');
  const from = fullAddress([shop.businessAddress, shop.city, shop.state, shop.pinCode, shop.country || 'India']);
  const to = fullAddress([delivery.line1, delivery.line2, delivery.city, delivery.region, delivery.postalCode, delivery.country || 'India']);
  const cacheKey = `${from}|${to}`;
  const hit = cachedRoutes.get(cacheKey);
  if (hit && hit.expiry > Date.now()) return { km: hit.km, demo: false };
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 7000);
  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { address: from }, destination: { address: to }, travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE', computeAlternativeRoutes: false,
        languageCode: 'en-IN', units: 'METRIC',
      }),
    });
    if (!response.ok) throw shippingError(503, 'SHIPPING_ROUTE_UNAVAILABLE', 'Unable to calculate delivery to this address.');
    const json = await response.json();
    const meters = json.routes?.[0]?.distanceMeters;
    if (!Number.isFinite(meters) || meters < 0) throw shippingError(422, 'DELIVERY_ROUTE_NOT_FOUND', 'No delivery route was found.');
    const km = Math.ceil(meters / 100) / 10;
    if (cachedRoutes.size >= 2000) cachedRoutes.clear();
    cachedRoutes.set(cacheKey, { km, expiry: Date.now() + 10 * 60 * 1000 });
    return { km, demo: false };
  } catch (error) {
    if (error.code) throw error;
    throw shippingError(503, 'SHIPPING_ROUTE_UNAVAILABLE', 'Unable to calculate delivery right now. Please retry.');
  } finally { clearTimeout(timeout); }
}

const SLABS = Object.freeze([
  { maxKm: 5, fees: [30, 50, 80] },
  { maxKm: 10, fees: [40, 60, 100] },
  { maxKm: 20, fees: [60, 80, 120] },
  { maxKm: Infinity, fees: [90, 120, 160] },
]);
/** A pure calculation that can be unit-tested without Google or a database. */
export function slabDeliveryPrice({ distanceKm, weightKg, merchandiseSubtotal }) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0 || !Number.isFinite(weightKg) || weightKg <= 0) {
    throw shippingError(422, 'SHIPPING_INPUT_INVALID', 'Distance and package weight must be valid.');
  }
  const maxDistance = numberSetting('SHIPPING_MAX_DISTANCE_KM', 50);
  const maxWeight = numberSetting('SHIPPING_MAX_WEIGHT_KG', 30);
  if (distanceKm > maxDistance) throw shippingError(422, 'OUTSIDE_DELIVERY_RADIUS', 'Delivery is not available for this address.');
  if (weightKg > maxWeight) throw shippingError(422, 'SHIPPING_WEIGHT_LIMIT', 'This order exceeds our delivery weight limit.');
  const row = SLABS.find(item => distanceKm <= item.maxKm);
  const weightIndex = weightKg <= 1 ? 0 : weightKg <= 5 ? 1 : 2;
  const freeAbove = numberSetting('SHIPPING_FREE_ABOVE_INR', 999);
  const freeShipping = freeAbove > 0 && Number(merchandiseSubtotal) >= freeAbove;
  const amount = freeShipping ? 0 : row.fees[weightIndex];
  return { amount: currency(amount), freeShipping, distanceKm, weightKg, calculationMethod: 'DISTANCE_WEIGHT_SLAB', currency: 'INR' };
}

export async function calculateShipping({ shop, address, cartItems, merchandiseSubtotal }) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) throw shippingError(400, 'CART_EMPTY', 'Cart is empty.');
  const weightGrams = cartItems.reduce((total, item) => {
    const grams = item.variant?.shippingWeightGrams;
    const qty = item.quantity;
    if (!Number.isInteger(grams) || grams <= 0) throw shippingError(409, 'PRODUCT_WEIGHT_MISSING', `Delivery weight is missing for ${item.product?.name || 'a product'}.`);
    if (!Number.isInteger(qty) || qty <= 0) throw shippingError(400, 'INVALID_QUANTITY', 'Invalid cart quantity.');
    return total + grams * qty;
  }, 0);
  const route = await getDrivingDistanceKm(shop, address);
  const quote = slabDeliveryPrice({ distanceKm: route.km, weightKg: weightGrams / 1000, merchandiseSubtotal });
  return route.demo
    ? { ...quote, calculationMethod: 'LOCAL_DEMO_DISTANCE_WEIGHT_SLAB', isSimulated: true }
    : quote;
}
