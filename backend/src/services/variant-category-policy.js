// New/added variants must represent category-appropriate purchasable options.
// This guard does not modify existing catalog, inventory or order records.
const RULES = [
  [/t-shirt|\bshirt\b|jeans|trouser|kurti|palazzo|\btop\b|socks|clothing|fashion/, ["color", "size"]],
  [/shoe|sneaker|sandal|\bflat\b|footwear/, ["size", "color"]],
  [/power bank/, ["capacity", "battery capacity", "color"]],
  [/charger/, ["wattage", "power", "plug type", "color"]],
  [/led bulb|\bbulb\b/, ["wattage", "color temperature", "light color"]],
  [/earphone/, ["color", "connectivity", "connection type"]],
  [/usb cable|\bcable\b/, ["length", "cable length", "connector type", "color"]],
  [/rice|flour|pulses|biscuit|tea|detergent|grocery/, ["weight", "pack size", "quantity", "flavor"]],
  [/sketchbook|notebook|folder|\bpen\b|\bpens\b|stationery/, ["pack size", "quantity", "color", "page count"]],
  [/bandage|mask|sanitizer|thermometer|pharmacy/, ["pack size", "quantity", "size"]],
];

export function allowedAttributeNames(categoryNames) {
  const breadcrumb = categoryNames.map((x) => String(x || "").toLowerCase()).join(" / ");
  return RULES.find(([regex]) => regex.test(breadcrumb))?.[1] || null;
}

export async function verifyCategoryVariantOptions(database, categoryId, variants) {
  const used = [...new Set((variants || []).flatMap((v) => (v.values || []).map((x) => x.attributeId)))];
  if (!used.length || !categoryId) return;
  const categories = await database.category.findMany({
    select: { id: true, name: true, parentId: true },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const names = [];
  const visited = new Set();
  let current = byId.get(categoryId);
  while (current && !visited.has(current.id)) {
    names.push(current.name);
    visited.add(current.id);
    current = byId.get(current.parentId);
  }
  const allowed = allowedAttributeNames(names);
  if (!allowed) return; // Custom categories remain extensible.
  const attributes = await database.variantAttribute.findMany({
    where: { id: { in: used } }, select: { id: true, name: true },
  });
  const matched = new Map(attributes.map((a) => [a.id, a.name.toLowerCase().trim()]));
  if (used.some((id) => !matched.has(id) || !allowed.includes(matched.get(id)))) {
    throw Object.assign(new Error(`Variant option not allowed for this category. Allowed: ${allowed.join(", ")}. Use product description for informational specifications.`), {
      status: 400, code: "CATEGORY_VARIANT_MISMATCH",
    });
  }
}
