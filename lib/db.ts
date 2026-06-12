import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

const globalForDb = globalThis as unknown as {
  drizzlePool?: Pool;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

function createPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to Postgres");
  }

  return new Pool({
    connectionString,
  });
}

const pool = globalForDb.drizzlePool ?? createPool();

export const db =
  globalForDb.db ??
  drizzle(pool, {
    schema,
  });

export { pool };

if (process.env.NODE_ENV !== "production") {
  globalForDb.drizzlePool = pool;
  globalForDb.db = db;
}
