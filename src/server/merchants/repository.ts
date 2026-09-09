import { database } from "@/server/db/client";

export async function listMerchants(slug?: string) {
  const result = await database().query(`
    SELECT m.id, m.slug, m.name, c.id AS "connectionId", c.enabled, c.last_synced_at AS "lastSyncedAt",
      c.last_error AS "lastError", count(p.id)::int AS "productCount"
    FROM merchants m
    LEFT JOIN merchant_connections c ON c.merchant_id = m.id
    LEFT JOIN products p ON p.merchant_id = m.id AND p.active
    WHERE ($1::text IS NULL OR m.slug = $1)
    GROUP BY m.id, c.id ORDER BY m.name
  `, [slug ?? null]);
  return result.rows as { id: string; slug: string; name: string; connectionId: string | null; enabled: boolean | null; lastSyncedAt: Date | null; lastError: string | null; productCount: number }[];
}
