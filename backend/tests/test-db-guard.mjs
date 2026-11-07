const fail = (message) => {
  throw new Error(`Test database guard: ${message}`);
};

const nodeEnv = process.env.NODE_ENV;
if (nodeEnv !== "test") {
  fail("NODE_ENV must be exactly 'test'.");
}

const rawDatabaseUrl = process.env.DATABASE_URL;
if (typeof rawDatabaseUrl !== "string" || rawDatabaseUrl.trim() === "") {
  fail("DATABASE_URL must be explicitly set.");
}

let databaseUrl;
try {
  databaseUrl = new URL(rawDatabaseUrl);
} catch {
  fail("DATABASE_URL must be a valid URL.");
}

if (databaseUrl.protocol !== "postgresql:" && databaseUrl.protocol !== "postgres:") {
  fail("DATABASE_URL must use the postgresql or postgres protocol.");
}

if (databaseUrl.hostname !== "localhost" && databaseUrl.hostname !== "127.0.0.1") {
  fail("DATABASE_URL must use localhost or 127.0.0.1.");
}

if (databaseUrl.port !== "5432") {
  fail("DATABASE_URL must use port 5432.");
}

if (databaseUrl.pathname !== "/eshop_test") {
  fail("DATABASE_URL must target exactly the 'eshop_test' database.");
}

if (databaseUrl.search !== "" || databaseUrl.hash !== "") {
  fail("DATABASE_URL must not include a query string or fragment.");
}

const sessionSecret = process.env.SESSION_SECRET;
if (typeof sessionSecret !== "string" || sessionSecret.length < 32) {
  fail("SESSION_SECRET must be at least 32 characters.");
}

// Print only non-secret target identity. Never print credentials or the full URL.
console.error("Test database guard: verified target localhost:5432/eshop_test");
