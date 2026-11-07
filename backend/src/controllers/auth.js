import { randomBytes } from "node:crypto";
import { activateEmployeeAccount } from "../services/employee-password-activation.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { env } from "../config/env.js";
import { ensureEmailConfigured, sendEmail } from "../services/email.js";
import {
  authVerificationService,
  hashAuthToken,
} from "../services/auth-verification.js";
import { authAccountService } from "../services/auth-accounts.js";
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TTL_MS = 30 * 60 * 1000;
const passwordSchema = z.string().min(12).max(128);
const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

function parseBody(schema) {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      const error = new Error("Request validation failed.");
      error.status = 400;
      error.code = "VALIDATION_ERROR";
      error.details = parsed.error.issues.map(({ path, message }) => ({
        field: path.join("."),
        message,
      }));
      next(error);
      return;
    }
    request.validatedBody = parsed.data;
    next();
  };
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  mobile: z.string().trim().min(7).max(20).optional(),
  password: passwordSchema,
});

export const authController = {
  authActivateEmployee: async (request, response, next) => {
    try {
      const { token, password } = request.validatedBody;

      const result = await activateEmployeeAccount(token, password);

      return response.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  },
  authLogout: (request, response, next) => {
    request.session.destroy((error) => {
      if (error) return next(error);
      response.clearCookie(request.portalSessionCookieName, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
      });
      response.status(204).end();
    });
  },
  authRegister_1: async (request, response, next) => {
    try {
      ensureEmailConfigured();
      const { name, email, mobile, password } = request.validatedBody;
      const exists = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (exists) {
        response.status(409).json({
          error: {
            code: "EMAIL_IN_USE",
            message: "An account with that email already exists.",
          },
        });
        return;
      }

      const user = await prisma.user.create({
        data: {
          role: "CUSTOMER",
          name,
          email,
          mobile,
          passwordHash: await bcrypt.hash(password, 12),
          isActive: true,
        },
        select: { id: true, email: true },
      });
      const code = await authVerificationService.createOtp(user.id);
      await authVerificationService.sendOtp(user.email, code);
      response.status(201).json({
        message: "Account created. Check your email for the verification code.",
      });
    } catch (error) {
      next(error);
    }
  },
  authVerifyEmail_2: async (request, response, next) => {
    try {
      const { email, code } = request.validatedBody;
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, emailVerifiedAt: true },
      });
      if (!user || user.emailVerifiedAt) {
        response.status(400).json({
          error: {
            code: "INVALID_VERIFICATION_CODE",
            message: "The verification code is invalid or expired.",
          },
        });
        return;
      }

      const now = new Date();
      const verification = await prisma.emailVerificationCode.findFirst({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: OTP_MAX_ATTEMPTS },
        },
        orderBy: { createdAt: "desc" },
      });
      if (
        !verification ||
        !(await bcrypt.compare(code, verification.codeHash))
      ) {
        if (verification) {
          await prisma.emailVerificationCode.updateMany({
            where: {
              id: verification.id,
              usedAt: null,
              attempts: { lt: OTP_MAX_ATTEMPTS },
            },
            data: { attempts: { increment: 1 } },
          });
        }
        response.status(400).json({
          error: {
            code: "INVALID_VERIFICATION_CODE",
            message: "The verification code is invalid or expired.",
          },
        });
        return;
      }

      const verified = await prisma.$transaction(async (transaction) => {
        const consumed = await transaction.emailVerificationCode.updateMany({
          where: {
            id: verification.id,
            usedAt: null,
            attempts: { lt: OTP_MAX_ATTEMPTS },
          },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) return false;
        await transaction.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: now },
        });
        return true;
      });
      if (!verified) {
        response.status(400).json({
          error: {
            code: "INVALID_VERIFICATION_CODE",
            message: "The verification code is invalid or expired.",
          },
        });
        return;
      }
      response.json({ message: "Email verified. You can now sign in." });
    } catch (error) {
      next(error);
    }
  },
  authActivateOwner_3: async (request, response, next) => {
    try {
      const { token, password } = request.validatedBody;
      const now = new Date();
      const activation = await prisma.ownerActivationToken.findUnique({
        where: { tokenHash: hashAuthToken(token) },
        select: { id: true, userId: true, expiresAt: true, usedAt: true },
      });
      if (!activation || activation.usedAt || activation.expiresAt <= now) {
        response.status(400).json({
          error: {
            code: "INVALID_ACTIVATION_LINK",
            message: "The activation link is invalid or expired.",
          },
        });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const activated = await prisma.$transaction(async (transaction) => {
        const consumed = await transaction.ownerActivationToken.updateMany({
          where: { id: activation.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) return false;
        await transaction.ownerActivationToken.updateMany({
          where: { userId: activation.userId, usedAt: null },
          data: { usedAt: now },
        });
        await transaction.user.update({
          where: { id: activation.userId, role: "SHOP_OWNER" },
          data: {
            passwordHash,
            isActive: true,
            emailVerifiedAt: now,
            sessionVersion: { increment: 1 },
          },
        });
        return true;
      });
      if (!activated) {
        response.status(400).json({
          error: {
            code: "INVALID_ACTIVATION_LINK",
            message: "The activation link is invalid or expired.",
          },
        });
        return;
      }
      response.json({
        message:
          "Owner account activated. Sign in after your shop has been activated by the platform administrator.",
      });
    } catch (error) {
      next(error);
    }
  },
  authResendVerification_4: async (request, response, next) => {
    try {
      ensureEmailConfigured();
      const { email } = request.validatedBody;
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, emailVerifiedAt: true },
      });
      if (user && !user.emailVerifiedAt) {
        const latest = await prisma.emailVerificationCode.findFirst({
          where: { userId: user.id, usedAt: null },
          orderBy: { createdAt: "desc" },
        });
        if (
          latest &&
          Date.now() - latest.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS
        ) {
          response.status(429).json({
            error: {
              code: "OTP_COOLDOWN",
              message: "Wait before requesting another verification code.",
            },
          });
          return;
        }
        const code = await authVerificationService.createOtp(user.id);
        await authVerificationService.sendOtp(email, code);
      }
      response.json({
        message: "If the account needs verification, a code has been sent.",
      });
    } catch (error) {
      next(error);
    }
  },
  authLogin_5: async (request, response, next) => {
    try {
      const { email, password, role, rememberMe } = request.validatedBody;
      const user = await authAccountService.authenticate(email, password, role);
      if (!user) {
        response.status(401).json({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid credentials or account not activated.",
          },
        });
        return;
      }

      request.session.regenerate((error) => {
        if (error) return next(error);
        request.session.userId = user.id;
        request.session.role = user.role;
        request.session.sessionVersion = user.sessionVersion;
        request.session.csrfToken = randomBytes(32).toString("hex");
        if (rememberMe) {
          if (request.session.cookie)
            request.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        } else if (request.session.cookie) {
          request.session.cookie.maxAge = undefined;
        }
        request.session.save((saveError) => {
          if (saveError) return next(saveError);
          response.json({
            user: {
              id: user.id,
              role: user.role,
              name: user.name,
              email: user.email,
              mobile: user.mobile,
              profileImageUrl: user.profileImageUrl,
            },
          });
        });
      });
    } catch (error) {
      next(error);
    }
  },
  authMe_6: async (request, response, next) => {
    const { sessionVersion, ownedShop, ...user } = request.authUser;
    response.json({ user });
  },
  authMe_7: async (request, response, next) => {
    try {
      const user = await authAccountService.updateProfile(
        request.authUser.id,
        request.validatedBody,
      );
      response.json({ user });
    } catch (error) {
      next(error);
    }
  },
  authChangePassword_8: async (request, response, next) => {
    try {
      const { currentPassword, newPassword } = request.validatedBody;
      const currentPasswordHash =
        await authAccountService.verifyCurrentPassword(
          request.authUser.id,
          currentPassword,
        );
      if (!currentPasswordHash) {
        response.status(400).json({
          error: {
            code: "CURRENT_PASSWORD_INVALID",
            message: "The current password is incorrect.",
          },
        });
        return;
      }
      if (
        await authAccountService.passwordMatches(
          newPassword,
          currentPasswordHash,
        )
      ) {
        response.status(400).json({
          error: {
            code: "PASSWORD_UNCHANGED",
            message: "Choose a password different from the current password.",
          },
        });
        return;
      }

      const updatedUser = await authAccountService.changePassword(
        request.authUser.id,
        newPassword,
      );
      request.session.regenerate((error) => {
        if (error) return next(error);
        request.session.userId = updatedUser.id;
        request.session.role = updatedUser.role;
        request.session.sessionVersion = updatedUser.sessionVersion;
        request.session.csrfToken = randomBytes(32).toString("hex");
        request.session.save((saveError) => {
          if (saveError) return next(saveError);
          response.json({
            message:
              "Password changed. Other active sessions have been signed out.",
          });
        });
      });
    } catch (error) {
      next(error);
    }
  },
  authForgotPassword_9: async (request, response, next) => {
    try {
      ensureEmailConfigured();
      const { email } = request.validatedBody;
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true, isActive: true },
      });
      if (user?.isActive) {
        const token = randomBytes(32).toString("hex");
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashAuthToken(token),
            expiresAt: new Date(Date.now() + RESET_TTL_MS),
          },
        });
        const portalUrl =
          user.role === "SHOP_OWNER"
            ? env.SHOP_OWNER_PORTAL_URL
            : user.role === "SUPER_ADMIN"
              ? env.SUPER_ADMIN_PORTAL_URL
              : env.CUSTOMER_PORTAL_URL;
        const link = `${portalUrl}/reset-password?token=${encodeURIComponent(token)}`;
        try {
          await sendEmail({
            to: email,
            subject: "Reset your E-Shop password",
            text: `Use this link within 30 minutes to reset your password: ${link}`,
            html: `<p><a href="${link}">Reset your E-Shop password</a></p><p>This link expires in 30 minutes.</p>`,
          });
        } catch (emailError) {
          console.error("Password-reset email delivery failed.", emailError);
        }
      }
      response.status(202).json({
        message:
          "If an eligible account exists, the password reset request has been received.",
      });
    } catch (error) {
      next(error);
    }
  },
  authResetPassword_10: async (request, response, next) => {
    try {
      const { token, password } = request.validatedBody;
      const now = new Date();
      const reset = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashAuthToken(token) },
        select: { id: true, userId: true, expiresAt: true, usedAt: true },
      });
      if (!reset || reset.usedAt || reset.expiresAt <= now) {
        response.status(400).json({
          error: {
            code: "INVALID_RESET_TOKEN",
            message: "The reset link is invalid or expired.",
          },
        });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const consumed = await prisma.$transaction(async (transaction) => {
        const result = await transaction.passwordResetToken.updateMany({
          where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (result.count !== 1) return false;
        await transaction.passwordResetToken.updateMany({
          where: { userId: reset.userId, usedAt: null },
          data: { usedAt: now },
        });
        await transaction.user.update({
          where: { id: reset.userId },
          data: { passwordHash, sessionVersion: { increment: 1 } },
        });
        return true;
      });
      if (!consumed) {
        response.status(400).json({
          error: {
            code: "INVALID_RESET_TOKEN",
            message: "The reset link is invalid or expired.",
          },
        });
        return;
      }
      response.json({
        message: "Password updated. Sign in with your new password.",
      });
    } catch (error) {
      next(error);
    }
  },
};
