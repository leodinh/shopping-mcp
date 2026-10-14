import type { SQL } from "drizzle-orm";
import { merchantConnections, type Database } from "@shopping-mcp/database";

/**
 * Turns a store connection off: drops its credentials, so search stops reaching the store at once.
 * Reconnecting the shop re-enables it. Returns the Merchant whose connection was disabled, if any.
 */
export async function disableConnection(where: SQL, reason: string, db: Database) {
  const [connection] = await db
    .update(merchantConnections)
    .set({
      enabled: false,
      credentialsEncrypted: null,
      tokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      lastError: reason,
    })
    .where(where)
    .returning({ merchantId: merchantConnections.merchantId });
  return connection?.merchantId ?? null;
}
