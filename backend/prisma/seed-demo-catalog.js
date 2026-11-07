import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { isStoredProductImage } from "../src/utils/product-images.js";

const categories = [
  "Men's Fashion",
  "Women's Fashion",
  "Footwear",
  "Electronics",
  "Accessories",
  "Home & Living"
];

const brands = ["DEMO Threadline", "DEMO Pace", "DEMO Sound", "DEMO Fieldwork", "DEMO Hearth"];

const products = [
  { name: "Classic Cotton Crew-Neck T-Shirt", category: "Men's Fashion", brand: "DEMO Threadline", sku: "DEMO-TEE-001", description: "Synthetic development-demo cotton crew-neck tee. Not supplier inventory.", variants: [
    { suffix: "S", price: 699, stock: 8, options: { Size: "S" } }, { suffix: "M", price: 699, stock: 12, options: { Size: "M" } }, { suffix: "L", price: 699, stock: 8, options: { Size: "L" } }
  ] },
  { name: "Floral Cotton Kurta", category: "Women's Fashion", brand: "DEMO Threadline", sku: "DEMO-KURTA-001", description: "Synthetic development-demo floral cotton kurta. Not supplier inventory.", variants: [
    { suffix: "S", price: 1299, stock: 6, options: { Size: "S" } }, { suffix: "M", price: 1299, stock: 10, options: { Size: "M" } }, { suffix: "L", price: 1299, stock: 6, options: { Size: "L" } }
  ] },
  { name: "Everyday Running Sneakers", category: "Footwear", brand: "DEMO Pace", sku: "DEMO-SNEAKERS-001", description: "Synthetic development-demo everyday running sneakers. Not supplier inventory.", variants: [
    { suffix: "7", price: 2499, stock: 3, options: { Size: "7" } }, { suffix: "8", price: 2499, stock: 6, options: { Size: "8" } }, { suffix: "9", price: 2499, stock: 6, options: { Size: "9" } }, { suffix: "10", price: 2499, stock: 3, options: { Size: "10" } }
  ] },
  { name: "Wireless Bluetooth Earbuds", category: "Electronics", brand: "DEMO Sound", sku: "DEMO-EARBUDS-001", description: "Synthetic development-demo wireless earbuds. Not supplier inventory.", variants: [
    { suffix: "BLK", price: 1499, stock: 10, options: { Color: "Black" } }, { suffix: "WHT", price: 1499, stock: 8, options: { Color: "White" } }
  ] },
  { name: "Minimalist Laptop Backpack", category: "Accessories", brand: "DEMO Fieldwork", sku: "DEMO-BACKPACK-001", description: "Synthetic development-demo laptop backpack. Not supplier inventory.", variants: [
    { suffix: "NVY", price: 1899, stock: 7, options: { Color: "Navy" } }, { suffix: "STN", price: 1899, stock: 5, options: { Color: "Stone" } }
  ] },
  { name: "Ceramic Coffee Mug Set", category: "Home & Living", brand: "DEMO Hearth", sku: "DEMO-MUGS-001", description: "Synthetic development-demo set of two ceramic coffee mugs. Not supplier inventory.", variants: [
    { suffix: "SND", price: 699, stock: 10, options: { Color: "Sand" } }, { suffix: "BLU", price: 699, stock: 8, options: { Color: "Blue" } }
  ] }
];

const optionAttributes = [
  { name: "Size", values: ["S", "M", "L", "7", "8", "9", "10"] },
  { name: "Color", values: ["Black", "White", "Navy", "Stone", "Sand", "Blue"] }
];

const backendRoot = fileURLToPath(new URL("../", import.meta.url));
const applyChanges = process.argv.includes("--apply");
const normalizeName = (name) => name.normalize("NFKC").trim().toLocaleLowerCase("en-US");

function requireValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} after its approval requirement is resolved.`);
  return value;
}

function verifyDevelopmentDatabase() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Demo seeding is restricted to NODE_ENV=development.");
  }
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL must be explicitly configured.");
  const url = new URL(rawUrl);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "5432" ||
    url.pathname !== "/eshop" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Demo seeding only permits localhost:5432/eshop with no URL options.");
  }
}

async function loadJsonManifest(environmentVariable) {
  const manifestPath = requireValue(environmentVariable);
  const absolutePath = path.resolve(backendRoot, manifestPath);
  const manifest = JSON.parse(await readFile(absolutePath, "utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(`${environmentVariable} must point to a JSON object.`);
  }
  return manifest;
}

async function loadApprovedImages() {
  const noImagesApproved = process.env.DEMO_CATALOG_NO_IMAGES_APPROVED === "true";
  const imagesApproved = process.env.DEMO_CATALOG_IMAGES_APPROVED === "true";
  if (noImagesApproved === imagesApproved) {
    throw new Error("Explicitly approve either a licensed image manifest or seeding without images.");
  }
  if (noImagesApproved) {
    if (process.env.DEMO_CATALOG_IMAGE_MANIFEST) {
      throw new Error("Remove DEMO_CATALOG_IMAGE_MANIFEST when approving a no-image seed.");
    }
    return {};
  }

  const manifest = await loadJsonManifest("DEMO_CATALOG_IMAGE_MANIFEST");
  const expectedSkus = new Set(products.map(({ sku }) => sku));
  if (Object.keys(manifest).length !== expectedSkus.size || Object.keys(manifest).some((sku) => !expectedSkus.has(sku))) {
    throw new Error("The image manifest must contain exactly one entry for each approved demo SKU.");
  }
  const seenUrls = new Set();
  for (const sku of expectedSkus) {
    const url = manifest[sku];
    if (typeof url !== "string" || !isStoredProductImage(url) || seenUrls.has(url)) {
      throw new Error(`Provide one unique stored product image URL for ${sku}.`);
    }
    const filename = path.basename(url);
    await stat(path.join(backendRoot, "uploads", "products", filename));
    seenUrls.add(url);
  }
  return manifest;
}

async function loadTaxManifest() {
  const manifest = await loadJsonManifest("DEMO_CATALOG_TAX_MANIFEST");
  const expectedSkus = new Set(products.map(({ sku }) => sku));
  if (Object.keys(manifest).length !== expectedSkus.size || Object.keys(manifest).some((sku) => !expectedSkus.has(sku))) {
    throw new Error("The tax manifest must contain HSN and GST values for each approved demo SKU.");
  }
  for (const sku of expectedSkus) {
    const tax = manifest[sku];
    const rate = Number(tax?.gstRate);
    if (typeof tax?.hsnCode !== "string" || !/^\d{4,10}$/.test(tax.hsnCode) || !Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new Error(`Provide a valid HSN code and GST rate from 0 to 1 for ${sku}.`);
    }
  }
  return manifest;
}

async function getApprovedContext(database) {
  const shopId = requireValue("DEMO_CATALOG_SHOP_ID");
  const ownerId = requireValue("DEMO_CATALOG_OWNER_ID");
  const actorId = requireValue("DEMO_CATALOG_ACTOR_ID");
  const [shop, owner, actor] = await Promise.all([
    database.shop.findUnique({ where: { id: shopId }, select: { id: true, name: true, status: true, state: true, ownerId: true } }),
    database.user.findUnique({ where: { id: ownerId }, select: { id: true, role: true, isActive: true, ownedShop: { select: { id: true } } } }),
    database.user.findUnique({ where: { id: actorId }, select: { id: true, role: true, isActive: true } })
  ]);
  if (!shop || shop.name !== "DEMO" || shop.status !== "ACTIVE" || !shop.state || shop.ownerId !== ownerId) {
    throw new Error("The selected shop must be the active DEMO shop, owned by the selected owner, with a tax state configured.");
  }
  if (!owner || owner.role !== "SHOP_OWNER" || !owner.isActive || owner.ownedShop?.id !== shop.id) {
    throw new Error("The selected owner must be an active Shop Owner assigned to the selected E-Shop Demo shop.");
  }
  if (!actor || actor.role !== "SUPER_ADMIN" || !actor.isActive) {
    throw new Error("DEMO_CATALOG_ACTOR_ID must identify an active Super Admin for audit logging.");
  }
  return { shop, owner, actor };
}

async function ensureCategory(database, name, parentId, create) {
  const normalizedName = normalizeName(name);
  const current = await database.category.findUnique({ where: { normalizedName } });
  if (current) {
    if (!current.isActive || current.parentId !== parentId) {
      throw new Error(`Existing category "${name}" is inactive or has a different parent; no changes were made.`);
    }
    return { id: current.id, created: false };
  }
  if (!create) return { id: null, created: true };
  const record = await database.category.create({ data: { name, normalizedName, parentId } });
  return { id: record.id, created: true };
}

async function ensureBrand(database, name, create) {
  const normalizedName = normalizeName(name);
  const current = await database.brand.findUnique({ where: { normalizedName } });
  if (current) {
    if (!current.isActive) throw new Error(`Existing brand "${name}" is inactive; no changes were made.`);
    return { id: current.id, created: false };
  }
  if (!create) return { id: null, created: true };
  const record = await database.brand.create({ data: { name, normalizedName } });
  return { id: record.id, created: true };
}

async function ensureVariantAttribute(database, name, create) {
  const normalizedName = normalizeName(name);
  const current = await database.variantAttribute.findUnique({ where: { normalizedName } });
  if (current) {
    if (!current.isActive) throw new Error(`Existing variant attribute "${name}" is inactive; no changes were made.`);
    return { id: current.id, created: false };
  }
  if (!create) return { id: null, created: true };
  const record = await database.variantAttribute.create({ data: { name, normalizedName, description: `DEMO catalog option: ${name}` } });
  return { id: record.id, created: true };
}

async function ensureVariantValue(database, attributeId, value, create) {
  if (!attributeId) return { id: null, created: true };
  const normalizedValue = normalizeName(value);
  const current = await database.variantAttributeValue.findUnique({
    where: { attributeId_normalizedValue: { attributeId, normalizedValue } }
  });
  if (current) {
    if (!current.isActive) throw new Error(`Existing variant value "${value}" is inactive; no changes were made.`);
    return { id: current.id, created: false };
  }
  if (!create) return { id: null, created: true };
  const record = await database.variantAttributeValue.create({ data: { attributeId, value, normalizedValue } });
  return { id: record.id, created: true };
}

function variantValuesFor(itemVariant, attributeIds, valueIds) {
  const values = Object.entries(itemVariant.options).map(([attribute, value]) => {
    const attributeId = attributeIds.get(attribute);
    const valueId = valueIds.get(`${attribute}:${value}`);
    if (!attributeId || !valueId) {
      if (!applyChanges) return null;
      throw new Error(`Could not resolve the ${attribute} option "${value}".`);
    }
    return { attributeId, valueId };
  });
  if (values.includes(null)) return null;
  return values.sort((left, right) => `${left.attributeId}:${left.valueId}`.localeCompare(`${right.attributeId}:${right.valueId}`));
}

function variantCombinationKey(values) {
  return values.length ? values.map(({ attributeId, valueId }) => `${attributeId}:${valueId}`).join("|") : "default";
}

async function seedCatalog(database, { shop, owner, actor }, imageManifest, taxManifest) {
  const categoryIds = new Map();
  const createdCategories = [];
  for (const category of categories) {
    const result = await ensureCategory(database, category, null, applyChanges);
    categoryIds.set(category, result.id);
    if (result.created) createdCategories.push(category);
  }

  const brandIds = new Map();
  const createdBrands = [];
  for (const brand of brands) {
    const result = await ensureBrand(database, brand, applyChanges);
    brandIds.set(brand, result.id);
    if (result.created) createdBrands.push(brand);
  }

  const attributeIds = new Map();
  const valueIds = new Map();
  const createdAttributes = [];
  for (const attribute of optionAttributes) {
    const result = await ensureVariantAttribute(database, attribute.name, applyChanges);
    attributeIds.set(attribute.name, result.id);
    if (result.created) createdAttributes.push(attribute.name);
    for (const value of attribute.values) {
      const option = await ensureVariantValue(database, result.id, value, applyChanges);
      valueIds.set(`${attribute.name}:${value}`, option.id);
    }
  }

  const createdProducts = [];
  const existingProducts = [];
  for (const item of products) {
    const categoryId = categoryIds.get(item.category);
    const brandId = brandIds.get(item.brand);
    if (applyChanges && (!categoryId || !brandId)) throw new Error(`Could not resolve category or brand for ${item.sku}.`);
    const expectedImages = imageManifest[item.sku] ? [imageManifest[item.sku]] : [];
    const tax = taxManifest[item.sku];
    const expectedVariants = item.variants.map((variant) => {
      const values = variantValuesFor(variant, attributeIds, valueIds);
      return { ...variant, sku: `${item.sku}-${variant.suffix}`, values, combinationKey: values ? variantCombinationKey(values) : null };
    });
    const existingVariants = await database.productVariant.findMany({
      where: { shopId: shop.id, sku: { in: expectedVariants.map(({ sku }) => sku) } },
      include: {
        product: { include: { images: { orderBy: { position: "asc" } } } },
        values: { include: { attribute: true, value: true } }
      }
    });
    if (existingVariants.length) {
      const currentProduct = existingVariants[0].product;
      const matches =
        existingVariants.length === expectedVariants.length &&
        existingVariants.every(({ product }) => product.id === currentProduct.id) &&
        currentProduct.name === item.name &&
        currentProduct.shopId === shop.id &&
        currentProduct.categoryId === categoryId &&
        currentProduct.brandId === brandId &&
        currentProduct.status === "DRAFT" &&
        currentProduct.hsnCode === tax.hsnCode &&
        Number(currentProduct.gstRate) === Number(tax.gstRate) &&
        currentProduct.taxInclusive === false &&
        JSON.stringify(currentProduct.images.map(({ url }) => url)) === JSON.stringify(expectedImages) &&
        expectedVariants.every((expected) => {
          const current = existingVariants.find(({ sku }) => sku === expected.sku);
          const currentOptions = current?.values.map(({ attribute, value }) => `${attribute.name}:${value.value}`).sort();
          const expectedOptions = Object.entries(expected.options).map(([attribute, value]) => `${attribute}:${value}`).sort();
          return current &&
            current.productId === currentProduct.id &&
            current.combinationKey === expected.combinationKey &&
            Number(current.price) === expected.price &&
            current.discountPrice === null &&
            current.stock === expected.stock &&
            current.isActive === true &&
            JSON.stringify(currentOptions) === JSON.stringify(expectedOptions);
        });
      if (!matches) throw new Error(`A SKU for ${item.sku} already exists with different or incomplete data; no existing record was changed.`);
      existingProducts.push(item.sku);
      continue;
    }
    if (!applyChanges) {
      createdProducts.push(item.sku);
      continue;
    }
    const product = await database.product.create({
      data: {
        shopId: shop.id,
        categoryId,
        brandId,
        name: item.name,
        description: item.description,
        status: "DRAFT",
        hsnCode: tax.hsnCode,
        gstRate: tax.gstRate,
        taxInclusive: false,
        images: { create: expectedImages.map((url, position) => ({ url, position })) },
        variants: {
          create: expectedVariants.map((variant) => ({
            shopId: shop.id,
            sku: variant.sku,
            combinationKey: variant.combinationKey,
            price: variant.price,
            stock: variant.stock,
            isActive: true,
            values: { create: variant.values }
          }))
        }
      },
      include: { variants: { select: { id: true, sku: true, stock: true } } }
    });
    for (const variant of product.variants) {
      await database.inventoryMovement.create({
        data: {
          shopId: shop.id,
          productVariantId: variant.id,
          quantity: variant.stock,
          reason: "MANUAL_ADJUSTMENT",
          referenceType: "DEMO_CATALOG_SEED",
          referenceId: variant.id,
          actorId: actor.id
        }
      });
    }
    await database.auditLog.create({
      data: {
        actorId: actor.id,
        action: "PRODUCT_CREATED",
        targetType: "PRODUCT",
        targetId: product.id,
        metadata: { source: "synthetic-development-demo", baseSku: item.sku, status: "DRAFT", variantSkus: product.variants.map(({ sku }) => sku) }
      }
    });
    createdProducts.push(item.sku);
  }

  if (applyChanges) {
    for (const name of createdCategories) {
      const record = await database.category.findUnique({ where: { normalizedName: normalizeName(name) } });
      await database.auditLog.create({ data: { actorId: actor.id, action: "CATEGORY_CREATED", targetType: "CATEGORY", targetId: record.id } });
    }
    for (const name of createdBrands) {
      const record = await database.brand.findUnique({ where: { normalizedName: normalizeName(name) } });
      await database.auditLog.create({ data: { actorId: actor.id, action: "BRAND_CREATED", targetType: "BRAND", targetId: record.id } });
    }
    for (const name of createdAttributes) {
      const record = await database.variantAttribute.findUnique({ where: { normalizedName: normalizeName(name) } });
      await database.auditLog.create({ data: { actorId: actor.id, action: "VARIANT_ATTRIBUTE_CREATED", targetType: "VARIANT_ATTRIBUTE", targetId: record.id, metadata: { source: "synthetic-development-demo" } } });
    }
  }

  return {
    shop: { id: shop.id, name: shop.name, ownerId: owner.id },
    categoriesToCreate: createdCategories,
    brandsToCreate: createdBrands,
    productSkusToCreate: createdProducts,
    alreadySeededSkus: existingProducts,
    proposedProducts: products.map(({ name, category, brand, sku, description, variants }) => ({
      name, category, brand, baseSku: sku, description,
      variants: variants.map(({ suffix, price, stock, options }) => ({ sku: `${sku}-${suffix}`, options, price, initialStock: stock }))
    })),
    applied: applyChanges
  };
}

async function main() {
  verifyDevelopmentDatabase();
  if (applyChanges && process.env.DEMO_CATALOG_SIX_ITEM_PROPOSAL_APPROVED !== "true") {
    throw new Error("Set DEMO_CATALOG_SIX_ITEM_PROPOSAL_APPROVED=true only after approving the exact six-item proposal.");
  }
  const imageManifest = await loadApprovedImages();
  const taxManifest = await loadTaxManifest();
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction((transaction) =>
      getApprovedContext(transaction).then((context) =>
        seedCatalog(transaction, context, imageManifest, taxManifest)
      )
    );
    console.log(JSON.stringify(result, null, 2));
    if (!applyChanges) console.log("Dry run only. No database rows were changed; pass --apply only after all approvals are in place.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const safeMessage = process.env.DATABASE_URL
    ? error.message.replaceAll(process.env.DATABASE_URL, "[redacted database URL]")
    : error.message;
  console.error(`Demo catalog seed refused or failed: ${safeMessage}`);
  process.exitCode = 1;
});
