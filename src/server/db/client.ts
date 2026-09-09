import { Pool } from "pg";

const globalDatabase = globalThis as unknown as { commercePool?: Pool };

export function database(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Copy .env.example to .env.");
  globalDatabase.commercePool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
  });
  return globalDatabase.commercePool;
}
