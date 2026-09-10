import type { Pool } from "pg";
import { database } from "@/server/db/client";
import { type MerchantConnector, validateSnapshot } from "@/server/connectors/contract";
import { getConnector } from "@/server/connectors/registry";
import type { MerchantConnection } from "@/server/merchants/merchant-connection.entity";

export async function syncConnection(connectionId: string, pool: Pool = database(), connectorOverride?: MerchantConnector) {
  const client = await pool.connect();
  let locked = false;
  let transaction = false;
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired", [connectionId]);
    locked = lock.rows[0].acquired;
    if (!locked) throw new Error("This connection is already syncing");
    const result = await client.query<MerchantConnection>(`
      SELECT id, merchant_id AS "merchantId", connector_type AS "connectorType", config, enabled,
        last_synced_at AS "lastSyncedAt", last_attempt_at AS "lastAttemptAt", last_error AS "lastError",
        created_at AS "createdAt"
      FROM merchant_connections WHERE id = $1
    `, [connectionId]);
    const connection = result.rows[0];
    if (!connection) throw new Error("Merchant connection not found");
    if (!connection.enabled) throw new Error("Merchant connection is disabled");
    await client.query("UPDATE merchant_connections SET last_attempt_at = now() WHERE id = $1", [connectionId]);
    const connector = connectorOverride ?? getConnector(connection.connectorType);
    const products = validateSnapshot(await connector.fetchCatalog(connection.config));
    await client.query("BEGIN");
    transaction = true;
    for (const product of products) {
      await client.query(`
        INSERT INTO products (merchant_id, external_id, name, description, price_minor, currency, images, inventory, product_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
        ON CONFLICT (merchant_id, external_id) DO UPDATE SET
          name = EXCLUDED.name, description = EXCLUDED.description, price_minor = EXCLUDED.price_minor,
          currency = EXCLUDED.currency, images = EXCLUDED.images, inventory = EXCLUDED.inventory,
          product_url = EXCLUDED.product_url, active = true, updated_at = now()
      `, [connection.merchantId, product.externalId, product.name, product.description, product.priceMinor,
        product.currency, JSON.stringify(product.images), product.inventory, product.productUrl]);
    }
    const removed = await client.query(`
      UPDATE products SET active = false, updated_at = now()
      WHERE merchant_id = $1 AND active AND NOT (external_id = ANY($2::text[]))
    `, [connection.merchantId, products.map((product) => product.externalId)]);
    await client.query("UPDATE merchant_connections SET last_synced_at = now(), last_error = NULL WHERE id = $1", [connectionId]);
    await client.query("COMMIT");
    transaction = false;
    return { connectionId, imported: products.length, deactivated: removed.rowCount ?? 0 };
  } catch (error) {
    if (transaction) await client.query("ROLLBACK");
    if (locked) {
      await client.query("UPDATE merchant_connections SET last_error = $2 WHERE id = $1", [
        connectionId, (error instanceof Error ? error.message : "Sync failed").slice(0, 2000),
      ]);
    }
    throw error;
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [connectionId]);
      client.release();
    } catch (error) {
      client.release(true);
      throw error;
    }
  }
}
