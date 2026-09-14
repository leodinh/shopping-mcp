import { and, count, eq, sql } from "drizzle-orm";
import { database, type Database } from "@/server/db/client";
import { requireSession } from "@/server/auth/session";
import { merchantConnections, merchants, products } from "@/server/db/schema";
import type { MerchantStatus } from "@/server/merchants/merchant-status";

const statusSelect = {
  id: merchants.id,
  slug: merchants.slug,
  name: merchants.name,
  connectionId: merchantConnections.id,
  connectorType: merchantConnections.connectorType,
  enabled: merchantConnections.enabled,
  lastSyncedAt: merchantConnections.lastSyncedAt,
  lastError: merchantConnections.lastError,
  productCount: sql<number>`cast(${count(products.id)} as int)`,
};

function statusQuery(db: Database) {
  return db
    .select(statusSelect)
    .from(merchants)
    .leftJoin(merchantConnections, eq(merchantConnections.merchantId, merchants.id))
    .leftJoin(products, and(eq(products.merchantId, merchants.id), eq(products.active, true)))
    .groupBy(merchants.id, merchantConnections.id);
}

export async function listMerchants(slug?: string, db: Database = database()) {
  const rows = await statusQuery(db)
    .where(slug === undefined ? undefined : eq(merchants.slug, slug))
    .orderBy(merchants.name);
  return rows as MerchantStatus[];
}

export async function getDashboardMerchant(cookieHeader: string | null, db: Database = database()) {
  let merchantId: string;
  try {
    merchantId = await requireSession(cookieHeader, db);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return null;
    throw error;
  }
  const rows = await statusQuery(db).where(eq(merchants.id, merchantId));
  return (rows[0] as MerchantStatus | undefined) ?? null;
}
