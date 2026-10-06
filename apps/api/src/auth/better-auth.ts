import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { database } from "@shopping-mcp/database";
import * as schema from "@shopping-mcp/database/schema";
import { authOptions } from "./auth-options";

export { ACCOUNT_SCOPE } from "./auth-options";

function createAuth() {
  return betterAuth({
    ...authOptions(),
    database: drizzleAdapter(database(), { provider: "pg", schema }),
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Lazily built so importing this module never needs DATABASE_URL or secrets. */
export function auth() {
  return (instance ??= createAuth());
}
