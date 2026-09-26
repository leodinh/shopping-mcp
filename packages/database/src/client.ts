import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "@shopping-mcp/config";
import * as schema from "./schema";

const globalDatabase = globalThis as unknown as { commercePool?: Pool };

export function pool(): Pool {
  globalDatabase.commercePool ??= new Pool({
    connectionString: databaseUrl(),
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
