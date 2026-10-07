import { eq, sql, type SQL } from "drizzle-orm";
import { merchantConnections, products, type Database } from "@shopping-mcp/database";

/**
 * Turns a store connection off: drops its credentials, stops it syncing, and hides its products
 * from search. Reconnecting the shop re-enables it, and the sync that requests reactivates the
 * products. Returns the Merchant whose connection was disabled, if any matched.
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
  if (!connection) return null;
  await db
    .update(products)
    .set({ active: false, updatedAt: sql`now()` })
    .where(eq(products.merchantId, connection.merchantId));
  return connection.merchantId;
}
