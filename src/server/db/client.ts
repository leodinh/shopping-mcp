import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema";

const globalDatabase = globalThis as unknown as { commercePool?: Pool };

export function pool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Copy .env.example to .env.");
  globalDatabase.commercePool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
  });
  return globalDatabase.commercePool;
}

export function databaseFrom(client: Pool | PoolClient) {
  return drizzle({ client, schema });
}

export function database() {
  return databaseFrom(pool());
}

type DrizzleDb = ReturnType<typeof databaseFrom>;
export type Database = DrizzleDb | Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];
