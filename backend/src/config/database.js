import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

if (process.env.NODE_ENV === "test") {
  let databaseUrl;

  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("Test database target must be localhost:5432/eshop_test.");
  }

  if (databaseUrl.protocol !== "postgresql:" && databaseUrl.protocol !== "postgres:") {
    throw new Error("Test database target must be localhost:5432/eshop_test.");
  }

  if (databaseUrl.hostname !== "localhost" && databaseUrl.hostname !== "127.0.0.1") {
    throw new Error("Test database target must be localhost:5432/eshop_test.");
  }

  if (databaseUrl.port !== "5432") {
    throw new Error("Test database target must be localhost:5432/eshop_test.");
  }

  if (databaseUrl.pathname !== "/eshop_test") {
    throw new Error("Test database target must be localhost:5432/eshop_test.");
  }

  if (databaseUrl.search !== "" || databaseUrl.hash !== "") {
    throw new Error("Test database target must be localhost:5432/eshop_test.");
  }
}

export const prisma = new PrismaClient();
export const sessionPool = new pg.Pool({ connectionString: env.DATABASE_URL });
