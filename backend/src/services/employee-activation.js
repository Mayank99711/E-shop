import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../config/database.js";
import { env } from "../config/env.js";
import { ensureEmailConfigured, sendEmail } from "./email.js";
import { getOwnerShop } from "./owner-shop.js";

const ACTIVATION_TTL_MS = 48 * 60 * 60 * 1000;

function createError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

export async function sendEmployeeActivationInvite(
  ownerId,
  actorId,
  employeeId,
) {
  // Ensure SMTP is configured before creating an invitation.
  ensureEmailConfigured();

  // Verify the owner and shop.
  const shop = await getOwnerShop(ownerId);

  if (shop.status !== "ACTIVE") {
    throw createError(403, "SHOP_INACTIVE", "Shop must be active.");
  }

  // Find only an employee belonging to this shop.
  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      shopId: shop.id,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          passwordHash: true,
        },
      },
    },
  });

  if (!employee) {
    throw createError(404, "EMPLOYEE_NOT_FOUND", "Employee not found.");
  }

  if (!employee.isActive || !employee.employeeRole) {
    throw createError(
      400,
      "EMPLOYEE_NOT_ELIGIBLE",
      "Employee must be active and have an assigned role.",
    );
  }

  if (!employee.user || employee.user.role !== "SHOP_EMPLOYEE") {
    throw createError(
      400,
      "EMPLOYEE_ACCOUNT_REQUIRED",
      "Create the employee login account first.",
    );
  }

  if (employee.user.isActive || employee.user.passwordHash) {
    throw createError(
      409,
      "EMPLOYEE_ALREADY_ACTIVATED",
      "Employee login account is already activated or has credentials.",
    );
  }

  // Generate a cryptographically secure activation token.
  const token = randomBytes(32).toString("hex");

  // Store only the hash, never the original token.
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACTIVATION_TTL_MS);

  // Invalidate older invitations and create the new token.
  await prisma.$transaction(async (tx) => {
    await tx.employeeActivationToken.updateMany({
      where: {
        userId: employee.user.id,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });

    await tx.employeeActivationToken.create({
      data: {
        userId: employee.user.id,
        tokenHash,
        expiresAt,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "EMPLOYEE_ACTIVATION_INVITED",
        targetType: "EMPLOYEE",
        targetId: employee.id,
        metadata: {
          expiresAt: expiresAt.toISOString(),
        },
      },
    });
  });

  // This frontend page will be built in a later step.
  const activationUrl = new URL(
    `${env.SHOP_OWNER_PORTAL_URL.replace(/\/+$/, "")}/activate-employee`,
  );

  activationUrl.searchParams.set("token", token);

  try {
    await sendEmail({
      to: employee.user.email,
      subject: "Activate your MyE-Shop employee account",
      text:
        `Set your employee account password using this link:\n\n` +
        `${activationUrl.toString()}\n\n` +
        "This link expires in 48 hours and can only be used once.",
      html:
        `<p>Your MyE-Shop employee account is ready for activation.</p>` +
        `<p><a href="${activationUrl.toString()}">Set your password</a></p>` +
        `<p>This link expires in 48 hours and can only be used once.</p>`,
    });
  } catch {
    throw createError(
      502,
      "ACTIVATION_EMAIL_FAILED",
      "Activation invitation was created, but email delivery failed. Please retry.",
    );
  }

  return {
    employeeId: employee.id,
    accountStatus: "PENDING_ACTIVATION",
    invitationSent: true,
  };
}
