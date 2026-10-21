import { eq, sql } from "drizzle-orm";
import { merchantConnections, type Database } from "@shopping-mcp/database";
import { disableConnection } from "../../store-connection/disable";
import { encryptCredentials, openCredentials } from "./credentials";
import { refreshShopifyToken, ShopifyTokenRejected } from "./token";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
export const RECONNECT = "Shopify access expired. Reconnect your store.";

/** Thrown when the store must be connected again; its connection has been disabled. */
export class ShopifyReconnectRequired extends Error {}

async function readConnection(connectionId: string, db: Database) {
  const [row] = await db
    .select({
      credentialsEncrypted: merchantConnections.credentialsEncrypted,
      tokenExpiresAt: merchantConnections.tokenExpiresAt,
      shopDomain: merchantConnections.shopDomain,
      enabled: merchantConnections.enabled,
    })
    .from(merchantConnections)
    .where(eq(merchantConnections.id, connectionId));
  if (!row?.enabled || !row.credentialsEncrypted || !row.shopDomain) {
    throw new ShopifyReconnectRequired(RECONNECT);
  }
  return row as typeof row & { credentialsEncrypted: string; shopDomain: string };
}

const expiring = (expiresAt: Date | null) =>
  expiresAt !== null && expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;

/**
 * An access token Shopify will accept for the next few minutes. Shopify refresh tokens work once,
 * so concurrent searches must not refresh the same store together: the refresh runs under a
 * per-connection advisory lock, and whoever waited re-reads the token the winner stored.
 */
export async function shopifyAccessToken(connectionId: string, db: Database): Promise<string> {
  const current = await readConnection(connectionId, db);
  if (!expiring(current.tokenExpiresAt)) {
    const { credentials, legacy } = openCredentials(current.credentialsEncrypted);
    if (legacy) {
      await db
        .update(merchantConnections)
        .set({ credentialsEncrypted: encryptCredentials(credentials) })
        .where(eq(merchantConnections.id, connectionId));
    }
    return credentials.accessToken;
  }

  return db.transaction(async (tx) => {
    // Released with the transaction, even if the refresh throws.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`shopify-token:${connectionId}`}, 0))`,
    );
    const row = await readConnection(connectionId, tx);
    const { credentials } = openCredentials(row.credentialsEncrypted);
    if (!expiring(row.tokenExpiresAt)) return credentials.accessToken; // refreshed while we waited
    if (!credentials.refreshToken) throw await reconnect(connectionId, db);
    let token;
    try {
      token = await refreshShopifyToken(row.shopDomain, credentials.refreshToken);
    } catch (error) {
      if (error instanceof ShopifyTokenRejected) throw await reconnect(connectionId, db, error);
      throw error;
    }
    // Stored before use: the old refresh token stopped working the moment Shopify answered.
    await tx
      .update(merchantConnections)
      .set({
        credentialsEncrypted: encryptCredentials({
          accessToken: token.accessToken,
          refreshToken: token.refreshToken ?? credentials.refreshToken,
        }),
        tokenExpiresAt: token.expiresAt,
        ...(token.refreshToken ? { refreshTokenExpiresAt: token.refreshTokenExpiresAt } : {}),
        ...(token.scope ? { scopes: token.scope } : {}),
      })
      .where(eq(merchantConnections.id, connectionId));
    return token.accessToken;
  });
}

/**
 * Shopify refused the refresh (expired after 90 days unused, or the app was removed): disable the
 * connection so the store shows Disconnected with a reconnect action, rather than failing silently.
 * Runs outside the refresh transaction so the rollback that follows the throw keeps it.
 */
async function reconnect(connectionId: string, db: Database, cause?: unknown) {
  await disableConnection(eq(merchantConnections.id, connectionId), RECONNECT, db);
  return new ShopifyReconnectRequired(RECONNECT, { cause });
}
