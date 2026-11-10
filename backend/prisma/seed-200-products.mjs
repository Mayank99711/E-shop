/**
 * E-Shop 200-product synthetic catalog seeder.
 * Dry run: node prisma/seed-200-products.mjs
 * Apply:   node prisma/seed-200-products.mjs --apply
 * Read README/usage notes before applying. Local localhost:5432/eshop only.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(here, "seed-data", "eshop_200_seed_products.json");
const APPLY = process.argv.includes("--apply");
const normalized = (x) => String(x).normalize("NFKC").trim().toLocaleLowerCase("en-US");

function safetyCheck() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is missing. Run from backend with its .env file.");
  const u = new URL(raw);
  if (!(["postgres:", "postgresql:"].includes(u.protocol)) ||
      !["localhost", "127.0.0.1"].includes(u.hostname) ||
      u.port !== "5432" || u.pathname !== "/eshop" || u.hash ||
      (u.search && u.search !== "?schema=public")) {
    throw new Error("SAFETY STOP: Only local localhost:5432/eshop (optional ?schema=public) is allowed.");
  }
  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "production") {
    throw new Error("SAFETY STOP: NODE_ENV cannot be test or production.");
  }
}

function validateManifest(data) {
  if (!Array.isArray(data?.products) || data.products.length !== 200) throw new Error("Expected exactly 200 products.");
  const variantTotal = data.products.reduce((sum, item) => sum + (item.variants?.length || 0), 0);
  if (variantTotal !== 440) throw new Error(`Expected 440 variants, got ${variantTotal}.`);
  const productSkus = new Set(), variantSkus = new Set();
  for (const item of data.products) {
    if (!item.sku?.startsWith("ESH-P-") || productSkus.has(item.sku)) throw new Error(`Missing or duplicate product SKU ${item.sku}`);
    productSkus.add(item.sku);
    if (!["Clothing", "Grocery", "Footwear", "Electronics", "Pharmacy", "Stationery"].includes(item.category)) throw new Error(`Unexpected category ${item.category}`);
    if (!item.segment || !item.subcategory || !item.brand || !item.name || !item.description || item.currency !== "INR") throw new Error(`Incomplete product ${item.sku}`);
    if (!["ACTIVE", "INACTIVE"].includes(item.status)) throw new Error(`Unexpected product status for ${item.sku}`);
    const variantStock = item.variants.reduce((sum, v) => sum + v.stock, 0);
    if (variantStock !== item.stock) throw new Error(`Stock mismatch for ${item.sku}`);
    for (const v of item.variants) {
      if (!v.sku?.startsWith("ESH-") || variantSkus.has(v.sku)) throw new Error(`Missing or duplicate variant SKU ${v.sku}`);
      variantSkus.add(v.sku);
      if (!v.color || !v.size || !Number.isInteger(v.stock) || v.stock < 0 || !Number.isFinite(v.priceINR) || v.priceINR <= 0 || !Number.isFinite(v.mrpINR) || v.mrpINR < v.priceINR || typeof v.isActive !== "boolean") throw new Error(`Invalid variant ${v.sku}`);
    }
  }
  return { variantTotal, productSkus, variantSkus };
}

/** Category.normalizedName is GLOBAL unique, not parent-scoped.
 * Reuse existing category only when parent matches. For conflicts, use
 * readable fully qualified labels; never move old categories between parents.
 */
async function ensureCategory(tx, label, parentId, qualifiedLabel) {
  for (const candidate of [label, qualifiedLabel].filter(Boolean)) {
    const key = normalized(candidate);
    const current = await tx.category.findUnique({ where: { normalizedName: key } });
    if (current && current.parentId === parentId) {
      if (!current.isActive) throw new Error(`Category ${candidate} is inactive; refusing to modify.`);
      return current.id;
    }
    if (!current) {
      const made = await tx.category.create({ data: { name: candidate, normalizedName: key, parentId, isActive: true } });
      return made.id;
    }
  }
  throw new Error(`No nonconflicting category label for ${qualifiedLabel}`);
}
async function ensureBrand(tx, name) {
  const key = normalized(name);
  const existing = await tx.brand.findUnique({ where: { normalizedName: key } });
  if (existing) {
    if (!existing.isActive) throw new Error(`Brand ${name} is inactive.`);
    return existing.id;
  }
  return (await tx.brand.create({ data: { name, normalizedName: key, isActive: true } })).id;
}
async function ensureAttribute(tx, name) {
  const key = normalized(name);
  const existing = await tx.variantAttribute.findUnique({ where: { normalizedName: key } });
  if (existing) {
    if (!existing.isActive) throw new Error(`Attribute ${name} is inactive.`);
    return existing.id;
  }
  return (await tx.variantAttribute.create({ data: { name, normalizedName: key, isActive: true } })).id;
}
async function ensureValue(tx, attributeId, value) {
  const normalizedValue = normalized(value);
  const where = { attributeId_normalizedValue: { attributeId, normalizedValue } };
  const existing = await tx.variantAttributeValue.findUnique({ where });
  if (existing) {
    if (!existing.isActive) throw new Error(`Variant value ${value} is inactive.`);
    return existing.id;
  }
  return (await tx.variantAttributeValue.create({ data: { attributeId, value, normalizedValue, isActive: true } })).id;
}

async function main() {
  safetyCheck();
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const { variantTotal, variantSkus } = validateManifest(manifest);
  const prisma = new PrismaClient();
  try {
    const shop = await prisma.shop.findUnique({
      where: { id: "df8ada24-3d46-488a-8ede-f1458d5e8f98" },
      select: { id: true, name: true, status: true },
    });
    if (!shop || shop.name !== "Mayank" || shop.status !== "ACTIVE") throw new Error("Mayank shop not found or inactive; refusing to seed.");

    const catalogSkus = manifest.products.map(p => p.sku);
    const existing = await prisma.product.findMany({ where: { shopId: shop.id, masterSku: { in: catalogSkus } }, select: { id: true, masterSku: true, status: true, _count: { select: { variants: true } } } });
    const existingSkus = new Set(existing.map(x => x.masterSku));
    const conflicts = await prisma.productVariant.findMany({ where: { shopId: shop.id, sku: { in: [...variantSkus] } }, select: { sku: true, product: { select: { masterSku: true } } } });
    if (conflicts.some(x => !existingSkus.has(x.product.masterSku))) throw new Error("Existing variants use dataset SKU(s) for unrelated products. Aborting.");
    const oldProducts = await prisma.product.count({ where: { shopId: shop.id, status: "ARCHIVED" } });
    const pending = manifest.products.filter(p => !existingSkus.has(p.sku));
    console.log(`Database: localhost:5432/eshop | Shop: ${shop.name}`);
    console.log(`Manifest: ${manifest.products.length} products, ${variantTotal} variants`);
    console.log(`Existing matching seed SKUs: ${existing.length}; to create: ${pending.length}`);
    console.log(`Archived products retained: ${oldProducts}`);
    if (!APPLY) {
      console.log("DRY RUN ONLY: No database records changed. Run with --apply only after reviewing this output.");
      return;
    }

    const result = await prisma.$transaction(async tx => {
      const categoryCache = new Map(), brandCache = new Map(), attrCache = new Map(), valCache = new Map();
      const resolveCategory = async item => {
        const key = [item.category, item.segment, item.subcategory].join("|");
        if (categoryCache.has(key)) return categoryCache.get(key);
        const root = await ensureCategory(tx, item.category, null, item.category);
        const segment = await ensureCategory(tx, item.segment, root, `${item.category} - ${item.segment}`);
        const leaf = await ensureCategory(tx, item.subcategory, segment, `${item.category} - ${item.segment} - ${item.subcategory}`);
        categoryCache.set(key, leaf);
        return leaf;
      };
      const resolveBrand = async name => {
        if (!brandCache.has(name)) brandCache.set(name, await ensureBrand(tx, name));
        return brandCache.get(name);
      };
      const resolveOption = async (attributeName, value) => {
        if (!attrCache.has(attributeName)) attrCache.set(attributeName, await ensureAttribute(tx, attributeName));
        const attributeId = attrCache.get(attributeName);
        const key = `${attributeName}:${value}`;
        if (!valCache.has(key)) valCache.set(key, await ensureValue(tx, attributeId, value));
        return { attributeId, valueId: valCache.get(key) };
      };

      let created = 0, variantsCreated = 0, alreadySeeded = 0;
      for (const item of manifest.products) {
        const found = existing.find(x => x.masterSku === item.sku);
        if (found) {
          if (found._count.variants !== item.variants.length || found.status !== (item.status === "ACTIVE" ? "ACTIVE" : "ARCHIVED")) throw new Error(`Seed SKU ${item.sku} already exists but differs in variant count/status; aborting.`);
          const current = await tx.productVariant.findMany({ where: { productId: found.id }, select: { sku: true } });
          if (current.some(x => !item.variants.some(v => v.sku === x.sku))) throw new Error(`Variant mismatch for ${item.sku}`);
          alreadySeeded++;
          continue;
        }
        const categoryId = await resolveCategory(item);
        const brandId = await resolveBrand(item.brand);
        const variants = [];
        for (const variant of item.variants) {
          const values = [await resolveOption("Color", variant.color), await resolveOption("Size", variant.size)];
          values.sort((a,b) => a.attributeId.localeCompare(b.attributeId));
          const combinationKey = values.map(v => `${v.attributeId}:${v.valueId}`).join("|");
          variants.push({
            shopId: shop.id, sku: variant.sku, combinationKey,
            variantName: `${variant.color} / ${variant.size}`, price: variant.priceINR,
            markedPrice: variant.mrpINR, stock: variant.stock, isActive: variant.isActive,
            values: { create: values },
          });
        }
        const createdProduct = await tx.product.create({
          data: {
            shopId: shop.id, categoryId, brandId, name: item.name,
            description: item.description, masterSku: item.sku,
            shortDescription: `Synthetic test product: ${item.sku}`,
            basePrice: item.priceINR, status: item.status === "ACTIVE" ? "ACTIVE" : "ARCHIVED", taxInclusive: false,
            variants: { create: variants },
          },
          include: { variants: { select: { id: true, stock: true } } },
        });
        for (const v of createdProduct.variants) {
          await tx.inventoryMovement.create({
            data: { shopId: shop.id, productVariantId: v.id, quantity: v.stock,
              reason: "MANUAL_ADJUSTMENT", referenceType: "SEED_200_CATALOG", referenceId: v.id },
          });
          variantsCreated++;
        }
        created++;
      }
      return { created, variantsCreated, alreadySeeded };
    }, { maxWait: 30000, timeout: 180000 });
    console.log("SEED APPLIED:", result);
    const [totalSeeded, totalActive] = await Promise.all([
      prisma.product.count({ where: { shopId: shop.id, masterSku: { in: catalogSkus } } }),
      prisma.product.count({ where: { shopId: shop.id, status: "ACTIVE" } }),
    ]);
    console.log(`VERIFY: matching dataset products=${totalSeeded}; shop active products=${totalActive}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(err => { console.error("SEED ERROR:", err.message); process.exitCode = 1; });
