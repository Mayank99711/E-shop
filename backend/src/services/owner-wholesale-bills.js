import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../config/database.js";
import { getOwnerShop } from "./owner-shop.js";

const UPLOAD_DIRECTORY = path.resolve(
  process.cwd(),
  "private-uploads",
  "wholesale-bills",
);

const MAX_FILE_SIZE = 8 * 1024 * 1024;

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { mimeType: "application/pdf", extension: ".pdf" };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mimeType: "image/jpeg", extension: ".jpg" };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { mimeType: "image/png", extension: ".png" };
  }

  return null;
}

function validateInvoiceDate(value) {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw fail(400, "INVALID_INVOICE_DATE", "Invalid invoice date.");
  }

  return parsed;
}

export async function uploadWholesaleBill(ownerId, data, file) {
  if (!file?.buffer) {
    throw fail(400, "FILE_REQUIRED", "Please attach an invoice.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw fail(400, "FILE_TOO_LARGE", "Maximum file size is 8 MB.");
  }

  const fileType = detectFileType(file.buffer);

  if (!fileType) {
    throw fail(
      400,
      "INVALID_FILE",
      "Only PDF, JPG and PNG invoices are supported.",
    );
  }

  const amount = Number(data.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw fail(400, "INVALID_AMOUNT", "Bill amount must be greater than zero.");
  }

  const invoiceDate = validateInvoiceDate(data.invoiceDate);
  const shop = await getOwnerShop(ownerId);

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: {
      id: data.purchaseOrderId,
      shopId: shop.id,
    },
    select: {
      id: true,
      shopId: true,
      wholesalerId: true,
      status: true,
    },
  });

  if (!purchaseOrder) {
    throw fail(
      404,
      "PURCHASE_ORDER_NOT_FOUND",
      "Purchase order not found in your shop.",
    );
  }

  if (purchaseOrder.status === "CANCELLED") {
    throw fail(
      409,
      "PURCHASE_ORDER_CANCELLED",
      "Cannot upload a bill for a cancelled purchase order.",
    );
  }

  const access = await prisma.shopWholesaler.findUnique({
    where: {
      shopId_wholesalerId: {
        shopId: shop.id,
        wholesalerId: purchaseOrder.wholesalerId,
      },
    },
  });

  if (!access?.isActive) {
    throw fail(
      403,
      "WHOLESALER_NOT_AUTHORIZED",
      "This wholesaler is not authorized for your shop.",
    );
  }

  const duplicate = await prisma.wholesaleBill.findUnique({
    where: {
      shopId_wholesalerId_invoiceNumber: {
        shopId: shop.id,
        wholesalerId: purchaseOrder.wholesalerId,
        invoiceNumber: data.invoiceNumber,
      },
    },
    select: { id: true },
  });

  if (duplicate) {
    throw fail(
      409,
      "DUPLICATE_INVOICE",
      "An invoice with this number already exists for the wholesaler.",
    );
  }

  const filename = `${randomUUID()}${fileType.extension}`;
  const savedPath = path.join(UPLOAD_DIRECTORY, filename);

  await mkdir(UPLOAD_DIRECTORY, { recursive: true });
  await writeFile(savedPath, file.buffer, { flag: "wx" });

  try {
    return await prisma.wholesaleBill.create({
      data: {
        shopId: shop.id,
        wholesalerId: purchaseOrder.wholesalerId,
        purchaseOrderId: purchaseOrder.id,
        invoiceNumber: data.invoiceNumber,
        invoiceDate,
        amount: data.amount,
        filePath: filename,
        originalFileName: path.basename(file.originalname).slice(0, 255),
        mimeType: fileType.mimeType,
        notes: data.notes || null,
        status: "UNPAID",
      },
      include: {
        wholesaler: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        purchaseOrder: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
  } catch (error) {
    await unlink(savedPath).catch(() => {});

    if (error.code === "P2002") {
      throw fail(409, "DUPLICATE_INVOICE", "Invoice already exists.");
    }

    throw error;
  }
}

export async function listWholesaleBills(ownerId) {
  const shop = await getOwnerShop(ownerId);

  return prisma.wholesaleBill
    .findMany({
      where: {
        shopId: shop.id,
      },
      include: {
        wholesaler: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        purchaseOrder: {
          select: {
            id: true,
            status: true,
          },
        },
        payments: {
          select: {
            amount: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })
    .then((bills) =>
      bills.map(({ payments, ...bill }) => {
        const paidAmount = payments.reduce(
          (sum, payment) => sum + Number(payment.amount),
          0,
        );

        return {
          ...bill,
          paidAmount: paidAmount.toFixed(2),
          outstandingAmount: Math.max(
            0,
            Number(bill.amount) - paidAmount,
          ).toFixed(2),
        };
      }),
    );
}

export async function getWholesaleBillFile(ownerId, billId) {
  const shop = await getOwnerShop(ownerId);

  const bill = await prisma.wholesaleBill.findFirst({
    where: {
      id: billId,
      shopId: shop.id,
    },
    select: {
      filePath: true,
      originalFileName: true,
      mimeType: true,
    },
  });

  if (!bill) {
    throw fail(404, "BILL_NOT_FOUND", "Invoice not found.");
  }

  // Only server-generated filenames may be read.
  if (!/^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(bill.filePath)) {
    throw fail(500, "INVALID_FILE_PATH", "Invalid stored invoice path.");
  }

  const fullPath = path.join(UPLOAD_DIRECTORY, bill.filePath);

  let bytes;

  try {
    bytes = await readFile(fullPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw fail(404, "FILE_NOT_FOUND", "Invoice file is missing.");
    }

    throw error;
  }

  return {
    bytes,
    filename: bill.originalFileName,
    mimeType: bill.mimeType,
  };
}
