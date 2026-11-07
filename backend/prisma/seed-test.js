import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

function fail(message) {
  throw new Error(`Test seed: ${message}`);
}

if (process.env.NODE_ENV !== "test") {
  fail("NODE_ENV must be exactly 'test'.");
}

const rawDatabaseUrl = process.env.DATABASE_URL;
if (typeof rawDatabaseUrl !== "string" || rawDatabaseUrl.trim() === "") {
  fail("DATABASE_URL must be explicitly set.");
}

let databaseUrl;
try {
  databaseUrl = new URL(rawDatabaseUrl);
} catch {
  fail("DATABASE_URL must be a valid URL.");
}

if (databaseUrl.protocol !== "postgresql:" && databaseUrl.protocol !== "postgres:") {
  fail("DATABASE_URL must use the postgresql or postgres protocol.");
}

if (databaseUrl.hostname !== "localhost" && databaseUrl.hostname !== "127.0.0.1") {
  fail("DATABASE_URL must use localhost or 127.0.0.1.");
}

if (databaseUrl.port !== "5432") {
  fail("DATABASE_URL must use port 5432.");
}

if (databaseUrl.pathname !== "/eshop_test") {
  fail("DATABASE_URL must target exactly the 'eshop_test' database.");
}

if (databaseUrl.search !== "" || databaseUrl.hash !== "") {
  fail("DATABASE_URL must not include a query string or fragment.");
}

const prisma = new PrismaClient();

const requiredEnv = (name, minimumLength = 12) => {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength) {
    fail(`${name} must be set to at least ${minimumLength} characters.`);
  }
  return value;
};

const normalizeName = (value) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en-US");

const superAdminEmail = "eshop-test-superadmin@example.test";
const ownerEmail = "eshop-test-owner@example.test";
const customerEmail = "eshop-test-customer@example.test";
const shopCode = "ESHOP-TEST-SHOP";
const categoryName = "Test Category";
const brandName = "Test Brand";
const attributeName = "Test Attribute";
const attributeValue = "Test Value";
const productName = "Test Product";
const productSku = "TEST-SKU-1";
const pendingRequestName = "Requested Test Brand";

const superAdminPassword = requiredEnv("ADMIN_PASSWORD");
const ownerPassword = requiredEnv("TEST_OWNER_PASSWORD");
const customerPassword = requiredEnv("TEST_CUSTOMER_PASSWORD");

async function ensureUser({ email, name, role, password, ownerCode = null }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, ownerCode: true }
  });

  if (existing) {
    if (existing.role !== role) {
      fail(`Existing user ${email} has role ${existing.role}, expected ${role}.`);
    }

    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        ownerCode: existing.ownerCode ?? ownerCode,
        passwordHash,
        isActive: true,
        emailVerifiedAt: new Date()
      }
    });
  }

  return prisma.user.create({
    data: {
      role,
      name,
      email,
      ownerCode,
      passwordHash,
      isActive: true,
      emailVerifiedAt: new Date()
    }
  });
}

async function ensureCategory(name) {
  const normalizedName = normalizeName(name);
  const existing = await prisma.category.findUnique({ where: { normalizedName } });

  if (existing) {
    if (!existing.isActive) {
      return prisma.category.update({
        where: { id: existing.id },
        data: { isActive: true }
      });
    }
    return existing;
  }

  return prisma.category.create({
    data: { name, normalizedName, isActive: true }
  });
}

async function ensureBrand(name) {
  const normalizedName = normalizeName(name);
  const existing = await prisma.brand.findUnique({ where: { normalizedName } });

  if (existing) {
    if (!existing.isActive) {
      return prisma.brand.update({
        where: { id: existing.id },
        data: { isActive: true }
      });
    }
    return existing;
  }

  return prisma.brand.create({
    data: { name, normalizedName, isActive: true }
  });
}

async function ensureVariantAttribute(name) {
  const normalizedName = normalizeName(name);
  const existing = await prisma.variantAttribute.findUnique({ where: { normalizedName } });

  if (existing) {
    if (!existing.isActive) {
      return prisma.variantAttribute.update({
        where: { id: existing.id },
        data: { isActive: true }
      });
    }
    return existing;
  }

  return prisma.variantAttribute.create({
    data: { name, normalizedName, isActive: true }
  });
}

async function ensureVariantValue(attributeId, value) {
  const normalizedValue = normalizeName(value);
  const existing = await prisma.variantAttributeValue.findUnique({
    where: {
      attributeId_normalizedValue: { attributeId, normalizedValue }
    }
  });

  if (existing) {
    if (!existing.isActive) {
      return prisma.variantAttributeValue.update({
        where: { id: existing.id },
        data: { isActive: true }
      });
    }
    return existing;
  }

  return prisma.variantAttributeValue.create({
    data: { attributeId, value, normalizedValue, isActive: true }
  });
}

async function ensureShop(ownerId, categoryId) {
  const existing = await prisma.shop.findUnique({
    where: { code: shopCode },
    select: { id: true, ownerId: true, status: true, categoryId: true }
  });

  if (existing) {
    if (existing.ownerId !== ownerId) {
      fail(`Existing shop ${shopCode} is owned by a different user.`);
    }

    if (existing.status !== "ACTIVE" || existing.categoryId !== categoryId) {
      return prisma.shop.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          categoryId
        }
      });
    }

    return existing;
  }

  return prisma.shop.create({
    data: {
      code: shopCode,
      name: "Test Shop",
      categoryId,
      ownerId,
      status: "ACTIVE"
    }
  });
}

async function ensureProduct(shopId, categoryId, brandId) {
  const existing = await prisma.product.findFirst({
    where: { shopId, name: productName },
    select: { id: true, status: true, categoryId: true, brandId: true }
  });

  if (existing) {
    if (existing.status !== "ACTIVE" || existing.categoryId !== categoryId || existing.brandId !== brandId) {
      return prisma.product.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          categoryId,
          brandId
        }
      });
    }
    return existing;
  }

  return prisma.product.create({
    data: {
      shopId,
      categoryId,
      brandId,
      name: productName,
      description: "Synthetic product for isolated E-Shop tests.",
      status: "ACTIVE"
    }
  });
}

async function ensureProductVariant(productId, shopId) {
  const existing = await prisma.productVariant.findFirst({
    where: { shopId, sku: productSku },
    select: { id: true, productId: true, isActive: true, price: true, stock: true }
  });

  if (existing) {
    if (existing.productId !== productId) {
      fail(`Existing variant ${productSku} belongs to a different product.`);
    }

    if (!existing.isActive || existing.price.toString() !== "19.99" || existing.stock !== 5) {
      return prisma.productVariant.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          price: "19.99",
          stock: 5
        }
      });
    }

    return existing;
  }

  return prisma.productVariant.create({
    data: {
      productId,
      shopId,
      sku: productSku,
      combinationKey: "default",
      price: "19.99",
      stock: 5,
      isActive: true
    }
  });
}

async function ensurePendingMasterDataRequest(requesterId, shopId) {
  const existing = await prisma.masterDataRequest.findFirst({
    where: {
      requesterId,
      shopId,
      type: "BRAND",
      status: "PENDING"
    },
    select: { id: true }
  });

  if (existing) {
    return existing;
  }

  return prisma.masterDataRequest.create({
    data: {
      type: "BRAND",
      proposedData: { name: pendingRequestName },
      status: "PENDING",
      requesterId,
      shopId
    }
  });
}

async function main() {
  const superAdmin = await ensureUser({
    email: superAdminEmail,
    name: "E-Shop Test Super Admin",
    role: "SUPER_ADMIN",
    password: superAdminPassword
  });

  const owner = await ensureUser({
    email: ownerEmail,
    name: "E-Shop Test Owner",
    role: "SHOP_OWNER",
    password: ownerPassword,
    ownerCode: "ESHOP-TEST-OWNER"
  });

  const customer = await ensureUser({
    email: customerEmail,
    name: "E-Shop Test Customer",
    role: "CUSTOMER",
    password: customerPassword
  });

  const category = await ensureCategory(categoryName);
  const brand = await ensureBrand(brandName);
  const attribute = await ensureVariantAttribute(attributeName);
  await ensureVariantValue(attribute.id, attributeValue);

  const shop = await ensureShop(owner.id, category.id);
  const product = await ensureProduct(shop.id, category.id, brand.id);
  await ensureProductVariant(product.id, shop.id);

  await ensurePendingMasterDataRequest(owner.id, shop.id);

  await prisma.$disconnect();
  console.log("Synthetic test fixtures are ready.");
}

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error("Test seed failed.");
  throw error;
});
