import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function parsePaymentDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw fail(400, "INVALID_PAYMENT_DATE", "Invalid payment date.");
  }

  return date;
}

function money(value) {
  return new Prisma.Decimal(value);
}

function paymentSummary(payment) {
  return {
    ...payment,
    wholesaler: payment.bill?.wholesaler,
    invoiceNumber: payment.bill?.invoiceNumber,
    billAmount: payment.bill?.amount,
  };
}

export async function listWholesalePayments(ownerId) {
  const shop = await getOwnerShop(ownerId);

  const payments = await prisma.wholesalePayment.findMany({
    where: { shopId: shop.id },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      bill: {
        select: {
          id: true,
          invoiceNumber: true,
          amount: true,
          status: true,
          wholesaler: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return payments.map(paymentSummary);
}

export async function recordWholesalePayment(ownerId, data) {
  const shop = await getOwnerShop(ownerId);

  if (shop.status !== "ACTIVE") {
    throw fail(409, "SHOP_NOT_ACTIVE", "Shop must be active.");
  }

  const amount = money(data.amount);

  if (!amount.isFinite() || amount.lte(0)) {
    throw fail(400, "INVALID_AMOUNT", "Payment must be greater than zero.");
  }

  const paymentDate = parsePaymentDate(data.paymentDate);
  const reference = data.transactionReference || null;
  const notes = data.notes || null;

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Lock this bill so concurrent requests cannot overpay it.
        await tx.$queryRaw`
          SELECT "id"
          FROM "WholesaleBill"
          WHERE "id" = ${data.billId}::uuid
            AND "shopId" = ${shop.id}::uuid
          FOR UPDATE
        `;

        const bill = await tx.wholesaleBill.findFirst({
          where: {
            id: data.billId,
            shopId: shop.id,
          },
          select: {
            id: true,
            shopId: true,
            amount: true,
            status: true,
          },
        });

        if (!bill) {
          throw fail(404, "BILL_NOT_FOUND", "Invoice not found.");
        }

        // Check retry requests against the unique payment key.
        const previous = await tx.wholesalePayment.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
        });

        if (previous) {
          const sameRequest =
            previous.shopId === shop.id &&
            previous.billId === bill.id &&
            previous.amount.equals(amount) &&
            previous.method === data.method &&
            previous.paymentDate.getTime() === paymentDate.getTime() &&
            (previous.transactionReference || null) === reference;

          if (!sameRequest) {
            throw fail(
              409,
              "DUPLICATE_PAYMENT_REQUEST",
              "This payment request key was already used.",
            );
          }

          return {
            payment: previous,
            alreadyRecorded: true,
          };
        }

        if (bill.status === "CANCELLED") {
          throw fail(
            409,
            "BILL_CANCELLED",
            "Cannot record payment for a cancelled invoice.",
          );
        }

        const totals = await tx.wholesalePayment.aggregate({
          where: {
            billId: bill.id,
            shopId: shop.id,
          },
          _sum: { amount: true },
        });

        const paid = totals._sum.amount || money(0);
        const outstanding = money(bill.amount).minus(paid);

        if (outstanding.lte(0)) {
          throw fail(
            409,
            "BILL_ALREADY_PAID",
            "This invoice is already fully paid.",
          );
        }

        if (amount.gt(outstanding)) {
          throw fail(
            409,
            "OVERPAYMENT",
            `Payment exceeds the outstanding amount of ${outstanding.toFixed(2)}.`,
          );
        }

        const payment = await tx.wholesalePayment.create({
          data: {
            shopId: shop.id,
            billId: bill.id,
            amount,
            method: data.method,
            transactionReference: reference,
            paymentDate,
            notes,
            idempotencyKey: data.idempotencyKey,
          },
        });

        const totalPaid = paid.plus(amount);
        const newStatus = totalPaid.gte(bill.amount)
          ? "PAID"
          : "PARTIALLY_PAID";

        await tx.wholesaleBill.update({
          where: { id: bill.id },
          data: { status: newStatus },
        });

        return {
          payment,
          alreadyRecorded: false,
          billStatus: newStatus,
          paidAmount: totalPaid.toFixed(2),
          outstandingAmount: money(bill.amount).minus(totalPaid).toFixed(2),
        };
      },
      { timeout: 10000 },
    );
  } catch (error) {
    if (error.code === "P2002") {
      throw fail(
        409,
        "DUPLICATE_PAYMENT_REQUEST",
        "This payment request has already been recorded.",
      );
    }

    throw error;
  }
}
