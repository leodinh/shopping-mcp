import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { handleShopifyWebhook } from "@shopping-mcp/commerce/store-connection";
import { merchantConnections, merchants, type Database } from "@shopping-mcp/database";
import { createTestDatabase } from "@shopping-mcp/database/testing";

process.env.SHOPIFY_API_SECRET = "test-secret";

let db: Database;
let drop: () => Promise<void>;
before(async () => ({ db, drop } = await createTestDatabase("shopify_webhooks")));
after(() => drop());

/** A Merchant with a live Shopify connection. */
async function store() {
  const shop = `shop-${randomUUID().slice(0, 8)}.myshopify.com`;
  const [merchant] = await db
    .insert(merchants)
    .values({ slug: shop, name: "Northline", websiteUrl: `https://${shop}` })
    .returning({ id: merchants.id });
  const [connection] = await db
    .insert(merchantConnections)
    .values({
      merchantId: merchant.id,
      connectorType: "shopify",
      config: { shop },
      shopDomain: shop,
      credentialsEncrypted: "encrypted",
    })
    .returning({ id: merchantConnections.id });
  return { shop, merchantId: merchant.id, connectionId: connection.id };
}

/** Search reaches a store exactly when its connection is enabled and has credentials. */
async function served(merchantId: string) {
  const [connection] = await db
    .select()
    .from(merchantConnections)
    .where(eq(merchantConnections.merchantId, merchantId));
  return connection?.enabled === true && connection.credentialsEncrypted !== null;
}

function webhook(topic: string, shop: string, body = "{}", secret = "test-secret") {
  const hmac = createHmac("sha256", secret).update(body).digest("base64");
  return { topic, shop, hmac, body: Buffer.from(body) };
}

test("webhooks with a bad signature change nothing", async () => {
  const { shop, merchantId } = await store();
  const forged = webhook("shop/redact", shop, "{}", "wrong-secret");
  assert.deepEqual(await handleShopifyWebhook(forged, db), { ok: false, reason: "invalid_hmac" });
  const tampered = { ...webhook("shop/redact", shop), body: Buffer.from('{"x":1}') };
  assert.deepEqual(await handleShopifyWebhook(tampered, db), { ok: false, reason: "invalid_hmac" });
  assert.equal(await served(merchantId), true);
});

test("app/uninstalled disables the connection and drops its token, so search stops reaching it", async () => {
  const { shop, merchantId, connectionId } = await store();
  assert.deepEqual(await handleShopifyWebhook(webhook("app/uninstalled", shop), db), { ok: true });

  const [connection] = await db
    .select()
    .from(merchantConnections)
    .where(eq(merchantConnections.id, connectionId));
  assert.equal(connection.enabled, false);
  assert.equal(connection.credentialsEncrypted, null);
  assert.match(connection.lastError ?? "", /uninstalled\. Reconnect/);
  assert.equal(await served(merchantId), false);
});

test("shop/redact deletes the Merchant and everything held for the shop", async () => {
  const { shop, merchantId } = await store();
  const bystander = await store();
  assert.deepEqual(await handleShopifyWebhook(webhook("shop/redact", shop), db), { ok: true });

  const connections = await db
    .select()
    .from(merchantConnections)
    .where(eq(merchantConnections.merchantId, merchantId));
  assert.equal(connections.length, 0, "the connection went with the Merchant");
  assert.equal((await db.select().from(merchants).where(eq(merchants.id, merchantId))).length, 0);
  assert.equal(await served(bystander.merchantId), true);
});

test("customer webhooks are acknowledged: no customer data is stored", async () => {
  const { shop, merchantId } = await store();
  for (const topic of ["customers/data_request", "customers/redact", "products/update"]) {
    assert.deepEqual(await handleShopifyWebhook(webhook(topic, shop), db), { ok: true });
  }
  assert.equal(await served(merchantId), true);
});
