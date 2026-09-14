import { and, eq, not, inArray, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { databaseFrom, pool } from "@/server/db/client";
import { type MerchantConnector, validateSnapshot } from "@/server/connectors/contract";
import { getConnector } from "@/server/connectors/registry";
import { merchantConnections, products } from "@/server/db/schema";

export async function syncConnection(
  connectionId: string,
  source: Pool = pool(),
  connectorOverride?: MerchantConnector,
) {
  const client = await source.connect();
  const db = databaseFrom(client);
  let locked = false;
  try {
    const lock = await db.execute<{ acquired: boolean }>(
      sql`SELECT pg_try_advisory_lock(hashtextextended(${connectionId}, 0)) AS acquired`,
    );
    locked = Boolean(lock.rows[0]?.acquired);
    if (!locked) throw new Error("This connection is already syncing");
    const [connection] = await db
      .select({
        id: merchantConnections.id,
        merchantId: merchantConnections.merchantId,
        enabled: merchantConnections.enabled,
        connectorType: merchantConnections.connectorType,
        config: merchantConnections.config,
      })
      .from(merchantConnections)
      .where(eq(merchantConnections.id, connectionId));
    if (!connection) throw new Error("Merchant connection not found");
    if (!connection.enabled) throw new Error("Merchant connection is disabled");
    await db
      .update(merchantConnections)
      .set({ lastAttemptAt: sql`now()` })
      .where(eq(merchantConnections.id, connectionId));
    const catalog = validateSnapshot(await (connectorOverride ?? getConnector(connection.connectorType)).fetchCatalog(connection.config));
    return await db.transaction(async (tx) => {
      for (const product of catalog) {
        await tx
          .insert(products)
          .values({
            merchantId: connection.merchantId,
            externalId: product.externalId,
            name: product.name,
            description: product.description,
            priceMinor: product.priceMinor,
            currency: product.currency,
            images: product.images,
            inventory: product.inventory,
            productUrl: product.productUrl,
          })
          .onConflictDoUpdate({
            target: [products.merchantId, products.externalId],
            set: {
              name: sql`excluded.name`,
              description: sql`excluded.description`,
              priceMinor: sql`excluded.price_minor`,
              currency: sql`excluded.currency`,
              images: sql`excluded.images`,
              inventory: sql`excluded.inventory`,
              productUrl: sql`excluded.product_url`,
              active: true,
              updatedAt: sql`now()`,
            },
          });
      }
      const removed = await tx
        .update(products)
        .set({ active: false, updatedAt: sql`now()` })
        .where(
          and(
            eq(products.merchantId, connection.merchantId),
            eq(products.active, true),
            catalog.length
              ? not(inArray(products.externalId, catalog.map((product) => product.externalId)))
              : sql`true`,
          ),
        );
      await tx
        .update(merchantConnections)
        .set({ lastSyncedAt: sql`now()`, lastError: null })
        .where(eq(merchantConnections.id, connectionId));
      return { connectionId, imported: catalog.length, deactivated: removed.rowCount ?? 0 };
    });
  } catch (error) {
    if (locked) {
      await db
        .update(merchantConnections)
        .set({ lastError: (error instanceof Error ? error.message : "Sync failed").slice(0, 2000) })
        .where(eq(merchantConnections.id, connectionId));
    }
    throw error;
  } finally {
    try {
      if (locked) {
        await db.execute(sql`SELECT pg_advisory_unlock(hashtextextended(${connectionId}, 0))`);
      }
      client.release();
    } catch (error) {
      client.release(true);
      throw error;
    }
  }
}
