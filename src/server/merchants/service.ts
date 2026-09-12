import type { Pool } from "pg";
import { database } from "@/server/db/client";

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
