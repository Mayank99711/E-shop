import { prisma } from "../config/database.js";

const pingDatabase = () => prisma.$queryRaw`SELECT 1`;

export function createHealthCheck(ping = pingDatabase) {
  return async function healthCheck(_request, response, next) {
    try {
      await ping();
      response.json({ status: "ok", database: "connected" });
    } catch {
      const error = new Error("The database is unavailable.");
      error.status = 503;
      error.code = "DATABASE_UNAVAILABLE";
      next(error);
    }
  }
}

export const healthCheck = createHealthCheck();
