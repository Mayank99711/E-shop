// Shopping options, not informational technical specifications.
// This is a UI policy only: it never modifies existing products or variants.
const rules = [
  {
    pattern: /water bottle|\bbottle\b|drinkware|flask|daily walk/,
    options: ["color", "size", "capacity", "pack size"],
    specs: "Material, insulation, dimensions, care instructions",
  },

  {
    pattern:
      /shirt|t-shirt|jeans|trouser|kurti|palazzo|\btop\b|socks|\bsuit\b|clothing|fashion/,
    options: ["color", "size"],
    specs: "Fabric, fit, pattern, wash care",
  },
  {
    pattern: /shoe|sneaker|sandal|\bflats?\b|footwear/,
    options: ["size", "color"],
    specs: "Upper material, sole, closure, heel height",
  },
  {
    pattern: /power bank/,
    options: ["capacity", "battery capacity", "color"],
    specs: "Output power (W), input, number of ports, battery chemistry",
  },
  {
    pattern: /charger/,
    options: ["wattage", "power", "plug type", "color"],
    specs: "Input voltage, output protocol, number of ports, compatibility",
  },
  {
    pattern: /led bulb|\bbulb\b/,
    options: ["wattage", "color temperature", "light color"],
    specs: "Lumens, voltage, beam angle, rated life",
  },
  {
    pattern: /earphone/,
    options: ["color", "connectivity", "connection type"],
    specs: "Driver size, mic, Bluetooth version, frequency response",
  },
  {
    pattern: /usb cable|\bcable\b/,
    options: ["length", "cable length", "connector type", "color"],
    specs: "USB standard, power rating, data rate, compatibility",
  },
  {
    pattern: /rice|flour|pulses|biscuit|tea|detergent|grocery/,
    options: ["weight", "pack size", "quantity", "flavor"],
    specs: "Ingredients, nutritional info, expiry, storage",
  },
  {
    pattern: /sketchbook|notebook|folder|\bpens?\b|stationery/,
    options: ["pack size", "quantity", "color", "page count"],
    specs: "Paper GSM, paper type, binding, material",
  },
  {
    pattern: /bandage|mask|sanitizer|thermometer|pharmacy/,
    options: ["pack size", "quantity", "size"],
    specs: "Material, dimensions, usage, safety information",
  },
];

export function variantPolicyForCategory(categoryId, categories = []) {
  const byId = new Map(categories.map((category) => [category.id, category]));

  const visited = new Set();
  let current = byId.get(categoryId);

  // Child category gets priority over parent category.
  while (current && !visited.has(current.id)) {
    visited.add(current.id);

    const name = String(current.name || "")
      .trim()
      .toLowerCase();

    const rule = rules.find(({ pattern }) => pattern.test(name));

    if (rule) {
      return rule;
    }

    current = byId.get(current.parentId);
  }

  return {
    options: null,
    specs:
      "Use product description for technical details; only purchasable choices belong in variants",
  };
}
export function allowedVariantAttributes(
  categoryId,
  categories = [],
  attributes = [],
) {
  const policy = variantPolicyForCategory(categoryId, categories);
  if (!categoryId || !policy.options) return attributes;
  return attributes.filter((attribute) =>
    policy.options.includes(
      String(attribute.name || "")
        .trim()
        .toLowerCase(),
    ),
  );
}
