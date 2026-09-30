import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { compareProducts, getProductById, searchProducts } from "@shopping-mcp/commerce/catalog";
import { handleShopifyWebhook } from "@shopping-mcp/commerce/store-connection";
import { enqueueDueSyncs, enqueueSync } from "@shopping-mcp/commerce/sync";
import {
  merchantConnections,
  merchants,
  products,
  syncRuns,
  type Database,
} from "@shopping-mcp/database";
import { createTestDatabase } from "@shopping-mcp/database/testing";

process.env.SHOPIFY_API_SECRET = "test-secret";

let db: Database;
let drop: () => Promise<void>;
before(async () => ({ db, drop } = await createTestDatabase("catalog_lifecycle")));
after(() => drop());

const DAY = 24 * 3600_000;
const ago = (ms: number) => new Date(Date.now() - ms);

/** A Merchant with a Shopify connection and one product. */
async function store(
  options: {
    enabled?: boolean;
    lastSyncedAt?: Date | null;
    lastAttemptAt?: Date | null;
    currency?: string;
  } = {},
) {
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
      enabled: options.enabled ?? true,
      lastSyncedAt: options.lastSyncedAt === undefined ? ago(1000) : options.lastSyncedAt,
      lastAttemptAt: options.lastAttemptAt === undefined ? ago(1000) : options.lastAttemptAt,
    })
    .returning({ id: merchantConnections.id });
  const [product] = await db
    .insert(products)
    .values({
      merchantId: merchant.id,
      externalId: "mug",
      name: "Stone mug",
      priceMinor: 1200,
      currency: options.currency ?? "USD",
      inventory: 3,
      productUrl: `https://${shop}/products/mug`,
    })
    .returning({ id: products.id });
  return { shop, merchantId: merchant.id, connectionId: connection.id, productId: product.id };
}

const served = async (merchantId: string) => (await searchProducts({ merchantId }, db)).total === 1;

test("syncs are queued per connection once due, never twice", async () => {
  const never = await store({ lastAttemptAt: null });
  const recent = await store({ lastAttemptAt: ago(3600_000) });
  const due = await store({ lastAttemptAt: ago(7 * 3600_000) });
  const disabled = await store({ enabled: false, lastAttemptAt: null });

  await enqueueDueSyncs(db);
  const queued = async (connectionId: string) =>
    (await db.select().from(syncRuns).where(eq(syncRuns.connectionId, connectionId))).length;
  assert.equal(await queued(never.connectionId), 1);
  assert.equal(await queued(due.connectionId), 1);
  assert.equal(await queued(recent.connectionId), 0);
  assert.equal(await queued(disabled.connectionId), 0);

  // Another worker's tick, a seller's Retry, and a racing enqueue add nothing.
  assert.equal(await enqueueDueSyncs(db), 0);
  await Promise.all([enqueueSync(never.connectionId, db), enqueueSync(never.connectionId, db)]);
  assert.equal(await queued(never.connectionId), 1);
});

test("search spans every currency unless one is named", async () => {
  const usd = await store({ currency: "USD" });
  const cad = await store({ currency: "CAD" });
  const all = await searchProducts({ q: "mug" }, db);
  const merchantIds = all.products.map((product) => product.merchant.id);
  assert.ok(merchantIds.includes(usd.merchantId) && merchantIds.includes(cad.merchantId));

  const onlyCad = await searchProducts({ q: "mug", currency: "CAD", maxPrice: 20 }, db);
  assert.ok(onlyCad.products.every((product) => product.currency === "CAD"));
  assert.ok(onlyCad.products.some((product) => product.merchant.id === cad.merchantId));
});

test("stores that are disabled or have not synced in 7 days are not served", async () => {
  const fresh = await store({ lastSyncedAt: ago(6 * DAY) });
  const stale = await store({ lastSyncedAt: ago(8 * DAY) });
  const neverSynced = await store({ lastSyncedAt: null });
  const disabled = await store({ enabled: false });

  assert.equal(await served(fresh.merchantId), true);
  for (const hidden of [stale, neverSynced, disabled]) {
    assert.equal(await served(hidden.merchantId), false);
    assert.equal(await getProductById(hidden.productId, db), null);
  }
  const compared = await compareProducts([fresh.productId, stale.productId], db);
  assert.deepEqual(compared.missingIds, [stale.productId]);
});

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

test("app/uninstalled disables the connection, drops its token, and hides the store", async () => {
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

  const [{ remaining }] = await db
    .select({ remaining: sql<number>`cast(count(*) as int)` })
    .from(products)
    .where(eq(products.merchantId, merchantId));
  assert.equal(remaining, 0);
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
