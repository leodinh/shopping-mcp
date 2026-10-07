import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { shopifyApiSecret, shopifyRedirectUri } from "@shopping-mcp/config";
import { database, merchantConnections, merchants, type Database } from "@shopping-mcp/database";
import { SHOPIFY_API_VERSION } from "../connectors/shopify/token";
import { disableConnection } from "./disable";

export const WEBHOOK_PATH = "/api/webhooks/shopify";

export type ShopifyWebhook = {
  topic: string | null;
  shop: string | null;
  /** Value of the X-Shopify-Hmac-Sha256 header. */
  hmac: string | null;
  /** The exact request body bytes: re-serialized JSON would not match the signature. */
  body: Buffer;
};

function validWebhookHmac(body: Buffer, hmac: string | null) {
  const secret = shopifyApiSecret();
  if (!hmac || !secret) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("base64"));
  const actual = Buffer.from(hmac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Applies a Shopify webhook. Reply 200 for `{ ok: true }` (including topics we ignore) so
 * Shopify stops retrying; a thrown error should become a 5xx so it retries.
 */
export async function handleShopifyWebhook(
  webhook: ShopifyWebhook,
  db: Database = database(),
): Promise<{ ok: true } | { ok: false; reason: "invalid_hmac" }> {
  if (!validWebhookHmac(webhook.body, webhook.hmac)) return { ok: false, reason: "invalid_hmac" };
  const shop = webhook.shop?.toLowerCase();
  if (!shop) return { ok: true };

  switch (webhook.topic) {
    case "app/uninstalled":
      // The token is dead. Reconnecting the shop restores the store.
      await disableConnection(
        eq(merchantConnections.shopDomain, shop),
        "Shopify app uninstalled. Reconnect your store.",
        db,
      );
      break;
    case "shop/redact": {
      // Sent 48h after uninstall: delete everything held for the shop (cascades to its
      // connection, products, and sync runs).
      const owners = db
        .select({ id: merchantConnections.merchantId })
        .from(merchantConnections)
        .where(eq(merchantConnections.shopDomain, shop));
      await db.delete(merchants).where(or(inArray(merchants.id, owners), eq(merchants.slug, shop)));
      break;
    }
    // customers/data_request, customers/redact: no customer data is stored. Other topics: ignored.
  }
  return { ok: true };
}

/** Subscribes the shop's `app/uninstalled` webhook. Compliance topics live in app settings. */
export async function registerShopifyWebhooks(shop: string, accessToken: string) {
  const endpoint = new URL(WEBHOOK_PATH, shopifyRedirectUri());
  if (endpoint.protocol !== "https:") {
    console.warn(`Skipping Shopify webhook registration: ${endpoint.href} is not HTTPS`);
    return;
  }
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({
      query: `mutation ($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
          userErrors { message }
        }
      }`,
      variables: { topic: "APP_UNINSTALLED", sub: { uri: endpoint.href } },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    errors?: Array<{ message: string }>;
    data?: { webhookSubscriptionCreate?: { userErrors: Array<{ message: string }> } };
  };
  const errors = [
    ...(payload.errors ?? []),
    ...(payload.data?.webhookSubscriptionCreate?.userErrors ?? []),
  ]
    .map((error) => error.message)
    // Reconnecting a shop re-registers the same address; that is already what we want.
    .filter((message) => !/already been taken/i.test(message));
  if (!response.ok || errors.length) {
    throw new Error(`HTTP ${response.status}: ${errors.join("; ") || "no response body"}`);
  }
}
