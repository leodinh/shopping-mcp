import { database } from "@/server/db/client";
import type { MerchantStatus } from "@/server/merchants/merchant-status";

export async function listMerchants(slug?: string) {
  const result = await database().query<MerchantStatus>(`
    SELECT m.id, m.slug, m.name, c.id AS "connectionId", c.enabled, c.last_synced_at AS "lastSyncedAt",
      c.last_error AS "lastError", count(p.id)::int AS "productCount"
    FROM merchants m
    LEFT JOIN merchant_connections c ON c.merchant_id = m.id
    LEFT JOIN products p ON p.merchant_id = m.id AND p.active
    WHERE ($1::text IS NULL OR m.slug = $1)
    GROUP BY m.id, c.id ORDER BY m.name
  `, [slug ?? null]);
  return result.rows;
}
