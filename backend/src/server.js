import app from "./app.js";
import { env } from "./config/env.js";
import { prisma, sessionPool } from "./config/database.js";

const server = app.listen(env.PORT, () => {
  console.log(`E-Shop API listening on port ${env.PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; closing server connections.`);
  server.close(async (error) => {
    if (error) {
      console.error("Failed to close the HTTP server cleanly.", error);
      process.exitCode = 1;
    }

    await Promise.all([prisma.$disconnect(), sessionPool.end()]);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
