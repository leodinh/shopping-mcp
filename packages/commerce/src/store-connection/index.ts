import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  database,
  merchantConnections,
  merchants,
  oauthAttempts,
  type Database,
} from "@shopping-mcp/database";
import { encryptCredentials } from "../connectors/shopify/credentials";
import { enqueueSync } from "../sync/outbox";
import {
  exchangeShopifyCode,
  type ExchangeCode,
  type ShopifyToken,
} from "../connectors/shopify/token";
import { disableConnection } from "./disable";
import { normalizeShopDomain, shopifyAuthorizeUrl, validShopifyHmac } from "./shopify";
import { registerShopifyWebhooks } from "./webhooks";

export type { ExchangeCode, ShopifyToken };

const ATTEMPT_TTL_MS = 10 * 60 * 1000;

export type StoreConnectionDeps = {
  db?: Database;
  exchangeCode?: ExchangeCode;
  registerWebhooks?: (shop: string, accessToken: string) => Promise<void>;
};

export { handleShopifyWebhook, type ShopifyWebhook } from "./webhooks";

export type BeginStoreConnectionResult =
  | { ok: true; authorizationUrl: string; browserBinding: string; expiresAt: Date }
  | { ok: false; reason: "invalid_shop" | "shop_taken" };

export type CompleteStoreConnectionResult =
  | { ok: true; merchantId: string }
  | {
      ok: false;
      reason:
        "invalid_hmac" | "invalid_shop" | "invalid_state" | "token_exchange_failed" | "shop_taken";
    };

export type StoreConnectionFailure =
  | Extract<BeginStoreConnectionResult, { ok: false }>["reason"]
  | Extract<CompleteStoreConnectionResult, { ok: false }>["reason"];

/** Thrown inside the completing transaction when another User owns the shop. */
class ShopTaken extends Error {}

/**
 * Starts a Store connection for `shop` on behalf of the signed-in User. The caller must hand
 * `browserBinding` back to `completeStoreConnection` from the same browser before `expiresAt`.
 */
export async function beginStoreConnection(
  shopInput: unknown,
  userId: string,
  deps: StoreConnectionDeps = {},
): Promise<BeginStoreConnectionResult> {
  const db = deps.db ?? database();
  const shop = normalizeShopDomain(shopInput);
  if (!shop) return { ok: false, reason: "invalid_shop" };
  if (await ownedByAnotherUser(shop, userId, db)) return { ok: false, reason: "shop_taken" };
  const state = randomBytes(16).toString("hex");
  const browserBinding = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS);
  await db.insert(oauthAttempts).values({ state, userId, shop, browserBinding, expiresAt });
  return {
    ok: true,
    authorizationUrl: shopifyAuthorizeUrl(shop, state),
    browserBinding,
    expiresAt,
  };
}

/**
 * Finishes a Store connection from Shopify's callback query. Only now, with Shopify having proven
 * the User controls the shop, is its Merchant created or (if unowned) claimed for them. The OAuth
 * attempt is used up even when the token exchange fails; the User then begins again.
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
  const userId = await consumeAttempt(state, shop, browserBinding, db);
  if (!userId) return { ok: false, reason: "invalid_state" };
  if (await ownedByAnotherUser(shop, userId, db)) return { ok: false, reason: "shop_taken" };

  let token: ShopifyToken;
  try {
    token = await exchangeCode(shop, code);
  } catch (error) {
    console.error("Shopify token exchange failed", error);
    return { ok: false, reason: "token_exchange_failed" };
  }

  try {
    const merchantId = await db.transaction(async (tx) => {
      const merchantId = await merchantFor(shop, userId, tx);
      const connectionId = await upsertConnection(merchantId, shop, token, tx);
      await enqueueSync(connectionId, tx);
      return merchantId;
    });
    try {
      await (deps.registerWebhooks ?? registerShopifyWebhooks)(shop, token.accessToken);
    } catch (error) {
      // Connecting must not fail over this; without it an uninstall just surfaces as a failed sync.
      console.error("Shopify webhook registration failed", error);
    }
    return { ok: true, merchantId };
  } catch (error) {
    // Lost a race: another User claimed or connected the shop while Shopify was answering.
    if (error instanceof ShopTaken || isUniqueViolation(error)) {
      return { ok: false, reason: "shop_taken" };
    }
    throw error;
  }
}

/**
 * Disconnects one of the User's stores: stops syncing it, drops its credentials, and hides its
 * products. Returns false when the store doesn't exist or belongs to someone else.
 */
export async function disconnectStore(
  userId: string,
  merchantId: string,
  db: Database = database(),
) {
  const [owned] = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(and(eq(merchants.id, merchantId), eq(merchants.userId, userId)));
  if (!owned) return false;
  await disableConnection(
    eq(merchantConnections.merchantId, merchantId),
    "Disconnected. Connect the store again to resume.",
    db,
  );
  return true;
}

/** The Merchant already holding `shop` (through its connection, else its slug), if any. */
async function shopOwner(shop: string, db: Database) {
  const [byConnection] = await db
    .select({ merchantId: merchants.id, userId: merchants.userId })
    .from(merchantConnections)
    .innerJoin(merchants, eq(merchants.id, merchantConnections.merchantId))
    .where(eq(merchantConnections.shopDomain, shop))
    .limit(1);
  if (byConnection) return byConnection;
  const [bySlug] = await db
    .select({ merchantId: merchants.id, userId: merchants.userId })
    .from(merchants)
    .where(eq(merchants.slug, shop))
    .limit(1);
  return bySlug ?? null;
}

async function ownedByAnotherUser(shop: string, userId: string, db: Database) {
  const owner = await shopOwner(shop, db);
  return owner?.userId != null && owner.userId !== userId;
}

/** Claims the shop's unowned Merchant for `userId`, or creates one owned by them. */
async function merchantFor(shop: string, userId: string, db: Database) {
  const owner = await shopOwner(shop, db);
  if (owner) {
    if (owner.userId === userId) return owner.merchantId;
    const [claimed] = await db
      .update(merchants)
      .set({ userId })
      .where(and(eq(merchants.id, owner.merchantId), isNull(merchants.userId)))
      .returning({ id: merchants.id });
    if (!claimed) throw new ShopTaken();
    return claimed.id;
  }
  const [created] = await db
    .insert(merchants)
    .values({
      slug: shop,
      name: shop.slice(0, shop.indexOf(".")),
      websiteUrl: `https://${shop}`,
      userId,
    })
    .onConflictDoNothing({ target: merchants.slug })
    .returning({ id: merchants.id });
  if (!created) throw new ShopTaken();
  return created.id;
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
    .returning({ userId: oauthAttempts.userId });
  return row?.userId ?? null;
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
