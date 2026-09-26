import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { shopifyApiKey, shopifyApiSecret } from "@shopping-mcp/config";
import {
  database,
  merchantConnections,
  oauthAttempts,
  type Database,
} from "@shopping-mcp/database";
import { createSession } from "../../auth/session";
import { enqueueSync } from "../../sync/outbox";
import { normalizeShopDomain } from "./connect";
import { encryptCredentials } from "./credentials";
import { verifyShopifyHmac } from "./hmac";

async function consumeAttempt(state: string, shop: string, browserBinding: string, db: Database) {
  const [row] = await db
    .update(oauthAttempts)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(oauthAttempts.state, state),
        eq(oauthAttempts.shop, shop),
        eq(oauthAttempts.browserBinding, browserBinding),
        isNull(oauthAttempts.consumedAt),
        gt(oauthAttempts.expiresAt, new Date()),
      ),
    )
    .returning({ merchantId: oauthAttempts.merchantId });
  if (!row) throw new Error("Invalid state");
  return row.merchantId;
}

async function exchangeCode(shop: string, code: string) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: shopifyApiKey(),
      client_secret: shopifyApiSecret(),
      code,
      expiring: "1",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("Token exchange failed");
  const token = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
  };
  if (!token.access_token) throw new Error("Token exchange failed");
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    scope: token.scope,
    expires_in: token.expires_in,
    refresh_token_expires_in: token.refresh_token_expires_in,
  };
}

async function upsertConnection(
  merchantId: string,
  shop: string,
  token: Awaited<ReturnType<typeof exchangeCode>>,
  db: Database,
) {
  const [owner] = await db
    .select({ merchantId: merchantConnections.merchantId })
    .from(merchantConnections)
    .where(eq(merchantConnections.shopDomain, shop))
    .limit(1);
  if (owner && owner.merchantId !== merchantId) throw new Error("Shop already connected");
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
  const refreshExpiresAt = token.refresh_token_expires_in
    ? new Date(Date.now() + token.refresh_token_expires_in * 1000)
    : null;
  const [connection] = await db
    .insert(merchantConnections)
    .values({
      merchantId,
      connectorType: "shopify",
      config: { shop },
      shopDomain: shop,
      credentialsEncrypted: encryptCredentials({
        accessToken: token.access_token,
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      }),
      scopes: token.scope ?? "",
      tokenExpiresAt: expiresAt,
      refreshTokenExpiresAt: refreshExpiresAt,
      enabled: true,
    })
    .onConflictDoUpdate({
      target: merchantConnections.merchantId,
      set: {
        connectorType: "shopify",
        config: sql`excluded.config`,
        shopDomain: sql`excluded.shop_domain`,
        credentialsEncrypted: sql`excluded.credentials_encrypted`,
        scopes: sql`excluded.scopes`,
        tokenExpiresAt: sql`excluded.token_expires_at`,
        refreshTokenExpiresAt: sql`excluded.refresh_token_expires_at`,
        enabled: true,
        lastError: null,
      },
    })
    .returning({ id: merchantConnections.id });
  return connection.id;
}

export async function completeShopifyConnect(
  params: URLSearchParams,
  browserBinding: string,
  db: Database = database(),
) {
  verifyShopifyHmac(params);
  const shop = normalizeShopDomain(params.get("shop"));
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  if (!state || !code) throw new Error("Invalid state");
  let sessionToken = "";
  await db.transaction(async (tx) => {
    const merchantId = await consumeAttempt(state, shop, browserBinding, tx);
    const [owner] = await tx
      .select({ merchantId: merchantConnections.merchantId })
      .from(merchantConnections)
      .where(eq(merchantConnections.shopDomain, shop))
      .limit(1);
    if (owner && owner.merchantId !== merchantId) throw new Error("Shop already connected");
    const connectionId = await upsertConnection(
      merchantId,
      shop,
      await exchangeCode(shop, code),
      tx,
    );
    await enqueueSync(connectionId, tx);
    sessionToken = await createSession(merchantId, tx);
  });
  return { sessionToken };
}
