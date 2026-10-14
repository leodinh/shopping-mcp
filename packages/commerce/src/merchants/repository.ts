import { and, eq } from "drizzle-orm";
import type { SellerStatus } from "@shopping-mcp/contracts";
import { database, merchantConnections, merchants, type Database } from "@shopping-mcp/database";

const statusSelect = {
  id: merchants.id,
  slug: merchants.slug,
  name: merchants.name,
  connectionId: merchantConnections.id,
  connectorType: merchantConnections.connectorType,
  enabled: merchantConnections.enabled,
  lastError: merchantConnections.lastError,
};

function statusQuery(db: Database) {
  return db
    .select(statusSelect)
    .from(merchants)
    .leftJoin(merchantConnections, eq(merchantConnections.merchantId, merchants.id));
}

export async function listMerchants(slug?: string, db: Database = database()) {
  const rows = await statusQuery(db)
    .where(slug === undefined ? undefined : eq(merchants.slug, slug))
    .orderBy(merchants.name);
  return rows.map(toSellerStatus);
}

/** The stores a signed-in User owns, for their dashboard. */
export async function listStoresForUser(userId: string, db: Database = database()) {
  const rows = await statusQuery(db).where(eq(merchants.userId, userId)).orderBy(merchants.name);
  return rows.map(toSellerStatus);
}

/** One of the User's stores, or null when it doesn't exist or belongs to someone else. */
export async function getOwnedStore(userId: string, merchantId: string, db: Database = database()) {
  const rows = await statusQuery(db).where(
    and(eq(merchants.id, merchantId), eq(merchants.userId, userId)),
  );
  return rows[0] ? toSellerStatus(rows[0]) : null;
}

function toSellerStatus(row: Omit<SellerStatus, "status">): SellerStatus {
  return {
    ...row,
    // Only a successful connect (token exchanged and shop verified) enables a connection;
    // disconnect, uninstall and a rejected token refresh disable it.
    status: row.enabled === true ? "connected" : "disconnected",
  };
}
