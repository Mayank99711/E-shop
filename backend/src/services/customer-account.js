import { prisma } from "../config/database.js";

function error(status, code, message) { return Object.assign(new Error(message), { status, code }); }

export function createCustomerAccountService(database = prisma) {
  return {
    listAddresses: (customerId) => database.address.findMany({ where: { customerId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }),
    createAddress: (customerId, data) => database.$transaction(async (tx) => {
      if (data.isDefault) await tx.address.updateMany({ where: { customerId, isDefault: true }, data: { isDefault: false } });
      return tx.address.create({ data: { ...data, customerId }, select: addressFields });
    }),
    updateAddress: (customerId, id, data) => database.$transaction(async (tx) => {
      const current = await tx.address.findFirst({ where: { id, customerId }, select: { id: true } });
      if (!current) throw error(404, "ADDRESS_NOT_FOUND", "Address not found.");
      if (data.isDefault) await tx.address.updateMany({ where: { customerId, isDefault: true }, data: { isDefault: false } });
      return tx.address.update({ where: { id: current.id }, data, select: addressFields });
    }),
    deleteAddress: async (customerId, id) => {
      const deleted = await database.address.deleteMany({ where: { id, customerId } });
      if (!deleted.count) throw error(404, "ADDRESS_NOT_FOUND", "Address not found.");
    },
    getDeletionRequest: (customerId) => database.accountDeletionRequest.findUnique({
      where: { customerId }, select: { id: true, status: true, reason: true, reviewedAt: true, createdAt: true, updatedAt: true }
    }),
    requestDeletion: (customerId, reason) => database.$transaction(async (tx) => {
      const current = await tx.accountDeletionRequest.findUnique({ where: { customerId } });
      if (current?.status === "PENDING") return { deletionRequest: current, created: false };
      const deletionRequest = await tx.accountDeletionRequest.upsert({
        where: { customerId },
        create: { customerId, reason: reason || null },
        update: { status: "PENDING", reason: reason || null, reviewerId: null, reviewedAt: null }
      });
      await tx.auditLog.create({ data: {
        actorId: customerId, action: "CUSTOMER_ACCOUNT_DELETION_REQUESTED", targetType: "ACCOUNT_DELETION_REQUEST",
        targetId: deletionRequest.id, metadata: { reasonProvided: Boolean(reason) }
      } });
      return { deletionRequest, created: true };
    }),
    cancelDeletion: (customerId) => database.$transaction(async (tx) => {
      const changed = await tx.accountDeletionRequest.updateMany({ where: { customerId, status: "PENDING" }, data: { status: "CANCELLED" } });
      if (!changed.count) {
        const existing = await tx.accountDeletionRequest.findUnique({ where: { customerId }, select: { id: true } });
        if (!existing) throw error(404, "DELETION_REQUEST_NOT_FOUND", "There is no account deletion request to cancel.");
        throw error(409, "DELETION_REQUEST_NOT_PENDING", "Only a pending account deletion request can be cancelled.");
      }
      const deletionRequest = await tx.accountDeletionRequest.findUnique({ where: { customerId } });
      await tx.auditLog.create({ data: { actorId: customerId, action: "CUSTOMER_ACCOUNT_DELETION_REQUEST_CANCELLED", targetType: "ACCOUNT_DELETION_REQUEST", targetId: deletionRequest.id } });
      return deletionRequest;
    })
  };
}

const addressFields = { id: true, label: true, recipient: true, mobile: true, line1: true, line2: true, city: true, region: true, postalCode: true, country: true, isDefault: true };
export const customerAccountService = createCustomerAccountService();
