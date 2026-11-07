import { prisma } from "../config/database.js";

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createAdminAccountRequestService(database = prisma) {
  return {
    list: ({ limit, cursor }) => database.accountDeletionRequest.findMany({
      take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: { createdAt: "desc" },
      include: { customer: { select: { id: true, name: true, email: true, mobile: true } }, reviewer: { select: { id: true, name: true } } }
    }),
    review: (id, reviewerId, status, reason) => database.$transaction(async (tx) => {
      const changed = await tx.accountDeletionRequest.updateMany({
        where: { id, status: "PENDING" }, data: { status, reviewerId, reviewedAt: new Date() }
      });
      if (!changed.count) {
        const existing = await tx.accountDeletionRequest.findUnique({ where: { id }, select: { id: true } });
        if (!existing) throw fail(404, "DELETION_REQUEST_NOT_FOUND", "Account deletion request not found.");
        throw fail(409, "DELETION_REQUEST_NOT_PENDING", "This account deletion request has already been resolved.");
      }
      const updated = await tx.accountDeletionRequest.findUnique({ where: { id }, include: {
        customer: { select: { id: true, name: true, email: true, mobile: true } }, reviewer: { select: { id: true, name: true } }
      } });
      await tx.auditLog.create({ data: { actorId: reviewerId, action: "CUSTOMER_ACCOUNT_DELETION_REQUEST_REVIEWED", targetType: "ACCOUNT_DELETION_REQUEST", targetId: id, metadata: { status, reason: reason || null } } });
      return updated;
    })
  };
}

export const adminAccountRequestService = createAdminAccountRequestService();
