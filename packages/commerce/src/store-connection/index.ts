import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  database,
  merchantConnections,
  merchants,
  oauthAttempts,
  type Database,
} from "@shopping-mcp/database";
import { createSession } from "../auth/session";
import { encryptCredentials } from "../connectors/shopify/credentials";
import { enqueueSync } from "../sync/outbox";
import {
  exchangeShopifyCode,
  normalizeShopDomain,
  shopifyAuthorizeUrl,
  validShopifyHmac,
  type ExchangeCode,
  type ShopifyToken,
} from "./shopify";

export type { ExchangeCode, ShopifyToken };

const ATTEMPT_TTL_MS = 10 * 60 * 1000;

export type StoreConnectionDeps = { db?: Database; exchangeCode?: ExchangeCode };

type Conflict = "shop_taken" | "shop_mismatch";

export type BeginStoreConnectionResult =
  | { ok: true; authorizationUrl: string; browserBinding: string; expiresAt: Date }
  | { ok: false; reason: "invalid_shop" | Conflict };

export type CompleteStoreConnectionResult =
  | { ok: true; sessionToken: string }
  | {
      ok: false;
      reason:
        "invalid_hmac" | "invalid_shop" | "invalid_state" | "token_exchange_failed" | Conflict;
    };

export type StoreConnectionFailure =
  | Extract<BeginStoreConnectionResult, { ok: false }>["reason"]
  | Extract<CompleteStoreConnectionResult, { ok: false }>["reason"];

/**
 * Starts a Store connection for `shop`. `currentMerchantId` is the signed-in Merchant, or null
 * to act as whichever Merchant owns (or will own) the shop. The caller must hand
 * `browserBinding` back to `completeStoreConnection` from the same browser before `expiresAt`.
 */
export async function beginStoreConnection(
  shopInput: unknown,
  currentMerchantId: string | null,
  deps: StoreConnectionDeps = {},
): Promise<BeginStoreConnectionResult> {
  const db = deps.db ?? database();
  const shop = normalizeShopDomain(shopInput);
  if (!shop) return { ok: false, reason: "invalid_shop" };
  const merchantId = currentMerchantId ?? (await merchantForShop(shop, db));
  const conflict = await connectionConflict(shop, merchantId, db);
  if (conflict) return { ok: false, reason: conflict };
  const state = randomBytes(16).toString("hex");
  const browserBinding = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS);
  await db.insert(oauthAttempts).values({ state, merchantId, shop, browserBinding, expiresAt });
  return {
    ok: true,
    authorizationUrl: shopifyAuthorizeUrl(shop, state),
    browserBinding,
    expiresAt,
  };
}

/**
 * Finishes a Store connection from Shopify's callback query. The OAuth attempt is used up
 * even when the token exchange fails; the Merchant then begins again.
 */
export async function completeStoreConnection(
  params: URLSearchParams,
  browserBinding: string,
  deps: StoreConnectionDeps = {},
): Promise<CompleteStoreConnectionResult> {
  const db = deps.db ?? database();
  const exchangeCode = deps.exchangeCode ?? exchangeShopifyCode;
  if (!validShopifyHmac(params)) return { ok: false, reason: "invalid_hmac" };
  const shop = normalizeShopDomain(params.get("shop"));
  if (!shop) return { ok: false, reason: "invalid_shop" };
  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code) return { ok: false, reason: "invalid_state" };
  const merchantId = await consumeAttempt(state, shop, browserBinding, db);
  if (!merchantId) return { ok: false, reason: "invalid_state" };
  const conflict = await connectionConflict(shop, merchantId, db);
  if (conflict) return { ok: false, reason: conflict };

  let token: ShopifyToken;
  try {
    token = await exchangeCode(shop, code);
  } catch (error) {
    console.error("Shopify token exchange failed", error);
    return { ok: false, reason: "token_exchange_failed" };
  }

  try {
    const sessionToken = await db.transaction(async (tx) => {
      const connectionId = await upsertConnection(merchantId, shop, token, tx);
      await enqueueSync(connectionId, tx);
      return createSession(merchantId, tx);
    });
    return { ok: true, sessionToken };
  } catch (error) {
    // merchant_id conflicts are upserted, so a unique violation here is shop_domain: lost a race.
    if (isUniqueViolation(error)) return { ok: false, reason: "shop_taken" };
    throw error;
  }
}

async function merchantForShop(shop: string, db: Database) {
  const [byShop] = await db
    .select({ id: merchantConnections.merchantId })
    .from(merchantConnections)
    .where(eq(merchantConnections.shopDomain, shop))
    .limit(1);
  if (byShop) return byShop.id;
  const [bySlug] = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.slug, shop))
    .limit(1);
  if (bySlug) return bySlug.id;
  const [inserted] = await db
    .insert(merchants)
    .values({ slug: shop, name: shop.slice(0, shop.indexOf(".")), websiteUrl: `https://${shop}` })
    .onConflictDoUpdate({ target: merchants.slug, set: { name: sql`excluded.name` } })
    .returning({ id: merchants.id });
  return inserted.id;
}

async function connectionConflict(
  shop: string,
  merchantId: string,
  db: Database,
): Promise<Conflict | null> {
  const rows = await db
    .select({ merchantId: merchantConnections.merchantId, shop: merchantConnections.shopDomain })
    .from(merchantConnections)
    .where(
      or(eq(merchantConnections.shopDomain, shop), eq(merchantConnections.merchantId, merchantId)),
    );
  for (const row of rows) {
    if (row.merchantId !== merchantId) return "shop_taken";
    if (row.shop && row.shop !== shop) return "shop_mismatch";
  }
  return null;
}

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
  return row?.merchantId ?? null;
}

async function upsertConnection(
  merchantId: string,
  shop: string,
  token: ShopifyToken,
  db: Database,
) {
  const [connection] = await db
    .insert(merchantConnections)
    .values({
      merchantId,
      connectorType: "shopify",
      config: { shop },
      shopDomain: shop,
      credentialsEncrypted: encryptCredentials({
        accessToken: token.accessToken,
        ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
      }),
      scopes: token.scope,
      tokenExpiresAt: token.expiresAt,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
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

function isUniqueViolation(error: unknown) {
  const { code, cause } = (error ?? {}) as { code?: string; cause?: { code?: string } };
  return code === "23505" || cause?.code === "23505";
}
