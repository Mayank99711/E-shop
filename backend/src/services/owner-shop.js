import { prisma } from "../config/database.js";

function shopNotFoundError() {
  const error = new Error("Your shop could not be found.");
  error.status = 404;
  error.code = "SHOP_NOT_FOUND";
  return error;
}

export async function getOwnerShop(ownerId, database = prisma) {
  const shop = await database.shop.findUnique({
    where: { ownerId },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      createdAt: true,
      category: { select: { id: true, name: true } },
      businessName: true,
      businessType: true,
      taxId: true,
      gstNumber: true,
      panNumber: true,
      pinCode: true,
      city: true,
      district: true,
      state: true,
      country: true,
      businessAddress: true,
      contactPhone: true,
      contactEmail: true,
      logoUrl: true
    }
  });
  if (!shop) throw shopNotFoundError();
  return shop;
}

export async function updateOwnerShopProfile(ownerId, actorId, profile, database = prisma) {
  const shop = await getOwnerShop(ownerId, database);
  return database.$transaction(async (transaction) => {
    const updatedShop = await transaction.shop.update({
      where: { id: shop.id },
      data: profile
    });
    await transaction.auditLog.create({
      data: {
        actorId,
        action: "SHOP_BUSINESS_PROFILE_UPDATED",
        targetType: "SHOP",
        targetId: shop.id,
        metadata: { fields: Object.keys(profile) }
      }
    });
    return updatedShop;
  });
}
