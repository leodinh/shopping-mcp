import type { Pool } from "pg";
import { database } from "@/server/db/client";
import { demoStores } from "@/shared/demo-stores";
import { syncConnection } from "@/server/sync/service";

export async function connectDemoStore(slug: unknown, pool: Pool = database()) {
  const store = demoStores.find((candidate) => candidate.slug === slug);
  if (!store) throw new Error("Choose one of the available demo stores.");
  const client = await pool.connect();
  let connectionId: string;
  try {
    await client.query("BEGIN");
    const merchant = await client.query(`
      INSERT INTO merchants (slug, name, website_url) VALUES ($1, $2, $3)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id
    `, [store.slug, store.name, store.websiteUrl]);
    const connection = await client.query(`
      INSERT INTO merchant_connections (merchant_id, connector_type, config)
      VALUES ($1, 'demo', $2::jsonb)
      ON CONFLICT (merchant_id) DO UPDATE SET enabled = true
      WHERE merchant_connections.connector_type = 'demo' RETURNING id
    `, [merchant.rows[0].id, JSON.stringify({ storeSlug: store.slug })]);
    if (!connection.rowCount) throw new Error("This merchant uses a different connector.");
    connectionId = connection.rows[0].id;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { storeName: store.name, ...await syncConnection(connectionId, pool) };
}
