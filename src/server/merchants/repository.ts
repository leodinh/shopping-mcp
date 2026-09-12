import type { Pool } from "pg";
import { database } from "@/server/db/client";
import { requireSession } from "@/server/auth/session";
import type { MerchantStatus } from "@/server/merchants/merchant-status";

const STATUS_SELECT = `
  SELECT m.id, m.slug, m.name, c.id AS "connectionId", c.connector_type AS "connectorType",
    c.enabled, c.last_synced_at AS "lastSyncedAt", c.last_error AS "lastError",
    count(p.id)::int AS "productCount"
  FROM merchants m
  LEFT JOIN merchant_connections c ON c.merchant_id = m.id
  LEFT JOIN products p ON p.merchant_id = m.id AND p.active
`;

export async function listMerchants(slug?: string, pool: Pool = database()) {
  const result = await pool.query<MerchantStatus>(
    `${STATUS_SELECT}
    WHERE ($1::text IS NULL OR m.slug = $1)
    GROUP BY m.id, c.id ORDER BY m.name`,
    [slug ?? null],
  );
  return result.rows;
}

export async function getDashboardMerchant(cookieHeader: string | null, pool: Pool = database()) {
  let merchantId: string;
  try {
    merchantId = await requireSession(cookieHeader, pool);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return null;
    throw error;
  }
  const result = await pool.query<MerchantStatus>(
    `${STATUS_SELECT} WHERE m.id = $1 GROUP BY m.id, c.id`,
    [merchantId],
  );
  return result.rows[0] ?? null;
}
