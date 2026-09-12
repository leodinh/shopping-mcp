import type { Pool } from "pg";
import { database } from "@/server/db/client";
import { demoStores } from "@/shared/demo-stores";
import { syncConnection } from "@/server/sync/service";
import type { Merchant } from "@/server/merchants/merchant.entity";
import type { MerchantConnection } from "@/server/merchants/merchant-connection.entity";

export async function ensureMerchantForShop(shop: string, pool: Pool = database()) {
  const existing = await pool.query<{ id: string }>(
    `SELECT COALESCE(
       (SELECT merchant_id FROM merchant_connections WHERE shop_domain = $1),
       (SELECT id FROM merchants WHERE slug = $1)
     ) AS id`,
    [shop],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;
  const name = shop.slice(0, shop.indexOf("."));
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO merchants (slug, name, website_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [shop, name, `https://${shop}`],
  );
  return inserted.rows[0].id;
}

export async function connectDemoStore(slug: unknown, pool: Pool = database()) {
  const store = demoStores.find((candidate) => candidate.slug === slug);
  if (!store) throw new Error("Choose one of the available demo stores.");
  const client = await pool.connect();
  let connectionId: string;
  try {
    await client.query("BEGIN");
    const merchant = await client.query<Pick<Merchant, "id">>(
      `
      INSERT INTO merchants (slug, name, website_url) VALUES ($1, $2, $3)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id
    `,
      [store.slug, store.name, store.websiteUrl],
    );
    const connection = await client.query<Pick<MerchantConnection, "id">>(
      `
      INSERT INTO merchant_connections (merchant_id, connector_type, config)
      VALUES ($1, 'demo', $2::jsonb)
      ON CONFLICT (merchant_id) DO UPDATE SET enabled = true
      WHERE merchant_connections.connector_type = 'demo' RETURNING id
    `,
      [merchant.rows[0].id, JSON.stringify({ storeSlug: store.slug })],
    );
    if (!connection.rowCount) throw new Error("This merchant uses a different connector.");
    connectionId = connection.rows[0].id;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { storeName: store.name, ...(await syncConnection(connectionId, pool)) };
}
