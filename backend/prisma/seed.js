import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "test") {
  throw new Error("Database seeding is not allowed when NODE_ENV is 'test'.");
}

const prisma = new PrismaClient();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim();
const password = process.env.ADMIN_PASSWORD;

if (!email || !name || !password || password.length < 12) {
  throw new Error("Set ADMIN_EMAIL, ADMIN_NAME, and an ADMIN_PASSWORD of at least 12 characters in the server environment.");
}

try {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new Error("An account already uses ADMIN_EMAIL. The seed process does not modify existing users.");
  }

  await prisma.user.create({
    data: {
      role: "SUPER_ADMIN",
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      isActive: true,
      emailVerifiedAt: new Date()
    }
  });
  console.log("Initial Super Admin account created.");
} finally {
  await prisma.$disconnect();
}
