import { createHash, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database.js";
import { sendEmail } from "./email.js";

export const hashAuthToken = (value) => createHash("sha256").update(value).digest("hex");

export function createAuthVerificationService(database = prisma, passwordHasher = bcrypt) {
  return {
    createOtp: async (userId, now = new Date()) => {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await database.$transaction([
        database.emailVerificationCode.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } }),
        database.emailVerificationCode.create({ data: {
          userId, codeHash: await passwordHasher.hash(code, 10), expiresAt: new Date(now.getTime() + 10 * 60 * 1000), lastSentAt: now
        } })
      ]);
      return code;
    },
    sendOtp: (email, code) => sendEmail({
      to: email, subject: "Verify your E-Shop email",
      text: `Your E-Shop verification code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your E-Shop verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, you can ignore this message.</p>`
    })
  };
}

export const authVerificationService = createAuthVerificationService();
