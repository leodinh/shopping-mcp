import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { decryptCredentials } from "@shopping-mcp/commerce/connectors/shopify";
import { getOwnedStore, listStoresForUser } from "@shopping-mcp/commerce/merchants";
import {
  beginStoreConnection,
  completeStoreConnection,
  disconnectStore,
  type ExchangeCode,
} from "@shopping-mcp/commerce/store-connection";
import {
  merchantConnections,
  merchants,
  oauthAttempts,
  products,
  syncRuns,
  user,
  type Database,
} from "@shopping-mcp/database";
import { createTestDatabase } from "@shopping-mcp/database/testing";

process.env.SESSION_SECRET = "test-session-secret-32-characters-min";
process.env.CREDENTIALS_KEY = "test-credentials-key-32-characters-min";
process.env.SHOPIFY_API_KEY = "test-key";
process.env.SHOPIFY_API_SECRET = "test-secret";
process.env.SHOPIFY_SCOPES = "read_products";
process.env.SHOPIFY_REDIRECT_URI = "http://127.0.0.1:3001/api/connections/shopify/callback";

let db: Database;
let drop: () => Promise<void>;
before(async () => ({ db, drop } = await createTestDatabase("store_connection")));
after(() => drop());

const grant: ExchangeCode = async () => ({
  accessToken: "shpat_test",
  refreshToken: "shprt_test",
  scope: "read_products",
  expiresAt: new Date(Date.now() + 3600_000),
  refreshTokenExpiresAt: null,
});
const mustNotExchange: ExchangeCode = async () => assert.fail("token exchange must not run");

function uniqueShop() {
  return `shop-${randomUUID().slice(0, 8)}.myshopify.com`;
}

async function newUser() {
  const [row] = await db
    .insert(user)
    .values({ name: "", email: `u-${randomUUID()}@example.test` })
    .returning({ id: user.id });
  return row.id;
}

function signed(params: Record<string, string>, secret = "test-secret") {
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const hmac = createHmac("sha256", secret).update(message).digest("hex");
  return new URLSearchParams({ ...params, hmac });
}

async function begin(shop: string, userId: string) {
  const result = await beginStoreConnection(shop, userId, { db });
  assert.ok(result.ok, `begin failed: ${JSON.stringify(result)}`);
  const state = new URL(result.authorizationUrl).searchParams.get("state")!;
  return { ...result, state };
}

function callback(shop: string, state: string, code = "auth-code") {
  return signed({ shop, code, state, timestamp: "1710000000" });
}

async function connect(shop: string, userId: string) {
  const started = await begin(shop, userId);
  const done = await completeStoreConnection(
    callback(shop, started.state),
    started.browserBinding,
    {
      db,
      exchangeCode: grant,
    },
  );
  assert.ok(done.ok, `complete failed: ${JSON.stringify(done)}`);
  return done.merchantId;
}

async function ownerOf(merchantId: string) {
  const [row] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
  return row.userId;
}

test("a signed-in User connects a shop: they own the new Merchant, credentials are stored, a sync is requested", async () => {
  const alice = await newUser();
  const shop = uniqueShop();
  const started = await begin(` https://${shop.toUpperCase()}/admin `, alice);
  assert.equal(
    started.authorizationUrl,
    `https://${shop}/admin/oauth/authorize?client_id=test-key&scope=read_products&redirect_uri=http%3A%2F%2F127.0.0.1%3A3001%2Fapi%2Fconnections%2Fshopify%2Fcallback&state=${started.state}`,
  );
  assert.match(started.browserBinding, /^[0-9a-f]{32}$/);
  const ttl = started.expiresAt.getTime() - Date.now();
  assert.ok(ttl > 9 * 60_000 && ttl <= 10 * 60_000);
  // Nothing is created for the shop until Shopify proves control of it.
  assert.equal((await db.select().from(merchants).where(eq(merchants.slug, shop))).length, 0);

  const exchanged: string[] = [];
  const done = await completeStoreConnection(
    callback(shop, started.state),
    started.browserBinding,
    {
      db,
      exchangeCode: async (s, code) => (exchanged.push(`${s} ${code}`), grant(s, code)),
    },
  );
  assert.ok(done.ok);
  assert.deepEqual(exchanged, [`${shop} auth-code`]);
  assert.equal(await ownerOf(done.merchantId), alice);

  const [connection] = await db
    .select()
    .from(merchantConnections)
    .where(eq(merchantConnections.merchantId, done.merchantId));
  assert.equal(connection.shopDomain, shop);
  assert.deepEqual(decryptCredentials(connection.credentialsEncrypted!), {
    accessToken: "shpat_test",
    refreshToken: "shprt_test",
  });
  const runs = await db.select().from(syncRuns).where(eq(syncRuns.connectionId, connection.id));
  assert.deepEqual(
    runs.map((run) => run.status),
    ["pending"],
  );

  const replay = await completeStoreConnection(
    callback(shop, started.state),
    started.browserBinding,
    {
      db,
      exchangeCode: mustNotExchange,
    },
  );
  assert.deepEqual(replay, { ok: false, reason: "invalid_state" });
});

test("begin rejects anything that is not a *.myshopify.com domain", async () => {
  const alice = await newUser();
  for (const shop of [
    "",
    "example.com",
    "https://example.com",
    "example.myshopify.com.attacker.example",
    "https://attacker.example/?shop=x.myshopify.com",
    123,
    null,
  ]) {
    assert.deepEqual(await beginStoreConnection(shop, alice, { db }), {
      ok: false,
      reason: "invalid_shop",
    });
  }
});

test("complete rejects a tampered HMAC, a stolen browser binding, and an expired attempt", async () => {
  const shop = uniqueShop();
  const started = await begin(shop, await newUser());
  const deps = { db, exchangeCode: mustNotExchange };

  const tampered = callback(shop, started.state);
  tampered.set("code", "other-code");
  assert.deepEqual(await completeStoreConnection(tampered, started.browserBinding, deps), {
    ok: false,
    reason: "invalid_hmac",
  });
  assert.deepEqual(
    await completeStoreConnection(signed({ shop, state: started.state }, "wrong"), "", deps),
    { ok: false, reason: "invalid_hmac" },
  );

  const stranger = "0".repeat(32);
  assert.deepEqual(await completeStoreConnection(callback(shop, started.state), stranger, deps), {
    ok: false,
    reason: "invalid_state",
  });

  await db
    .update(oauthAttempts)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(oauthAttempts.state, started.state));
  assert.deepEqual(
    await completeStoreConnection(callback(shop, started.state), started.browserBinding, deps),
    { ok: false, reason: "invalid_state" },
  );
});

test("another User's shop is refused at begin, at complete, and when they win a race", async () => {
  const alice = await newUser();
  const mallory = await newUser();
  const shop = uniqueShop();

  const malloryStarted = await begin(shop, mallory);
  await connect(shop, alice);
  assert.deepEqual(await beginStoreConnection(shop, mallory, { db }), {
    ok: false,
    reason: "shop_taken",
  });
  assert.deepEqual(
    await completeStoreConnection(
      callback(shop, malloryStarted.state),
      malloryStarted.browserBinding,
      {
        db,
        exchangeCode: mustNotExchange,
      },
    ),
    { ok: false, reason: "shop_taken" },
  );

  const raced = uniqueShop();
  const slow = await begin(raced, mallory);
  const result = await completeStoreConnection(callback(raced, slow.state), slow.browserBinding, {
    db,
    // Alice finishes connecting the same shop while Shopify is still answering Mallory.
    exchangeCode: async (s, code) => {
      await connect(raced, alice);
      return grant(s, code);
    },
  });
  assert.deepEqual(result, { ok: false, reason: "shop_taken" });
});

test("one User can own several stores, and reconnecting a store keeps the same Merchant", async () => {
  const alice = await newUser();
  const first = await connect(uniqueShop(), alice);
  const secondShop = uniqueShop();
  const second = await connect(secondShop, alice);
  assert.notEqual(first, second);
  assert.equal(await connect(secondShop, alice), second);
  const stores = await listStoresForUser(alice, db);
  assert.deepEqual(stores.map((store) => store.id).sort(), [first, second].sort());
  assert.equal((await getOwnedStore(alice, first, db))?.id, first);
  const bob = await newUser();
  assert.equal(await getOwnedStore(bob, first, db), null);
  assert.deepEqual(await listStoresForUser(bob, db), []);
});

test("a store connected before sign-in existed is claimed by whoever reconnects its shop", async () => {
  const shop = uniqueShop();
  const [legacy] = await db
    .insert(merchants)
    .values({ slug: shop, name: "Legacy", websiteUrl: `https://${shop}` })
    .returning({ id: merchants.id });
  await db.insert(merchantConnections).values({
    merchantId: legacy.id,
    connectorType: "shopify",
    config: { shop },
    shopDomain: shop,
  });

  const alice = await newUser();
  assert.equal(await connect(shop, alice), legacy.id);
  assert.equal(await ownerOf(legacy.id), alice);
  assert.deepEqual(await beginStoreConnection(shop, await newUser(), { db }), {
    ok: false,
    reason: "shop_taken",
  });
});

test("a failed token exchange stores nothing and uses up the attempt", async () => {
  const shop = uniqueShop();
  const started = await begin(shop, await newUser());
  const deps = {
    db,
    exchangeCode: async () => {
      throw new Error("Shopify said no");
    },
  };
  const result = await completeStoreConnection(
    callback(shop, started.state),
    started.browserBinding,
    deps,
  );
  assert.deepEqual(result, { ok: false, reason: "token_exchange_failed" });

  const [attempt] = await db
    .select()
    .from(oauthAttempts)
    .where(eq(oauthAttempts.state, started.state));
  assert.ok(attempt.consumedAt);
  assert.equal((await db.select().from(merchants).where(eq(merchants.slug, shop))).length, 0);
  assert.deepEqual(
    await completeStoreConnection(callback(shop, started.state), started.browserBinding, deps),
    { ok: false, reason: "invalid_state" },
  );
});

test("complete subscribes the uninstall webhook, and a failed subscription does not fail connecting", async () => {
  const alice = await newUser();
  const registered: string[] = [];
  const shop = uniqueShop();
  const started = await begin(shop, alice);
  const done = await completeStoreConnection(
    callback(shop, started.state),
    started.browserBinding,
    {
      db,
      exchangeCode: grant,
      registerWebhooks: async (s, accessToken) => void registered.push(`${s} ${accessToken}`),
    },
  );
  assert.ok(done.ok);
  assert.deepEqual(registered, [`${shop} shpat_test`]);

  const other = uniqueShop();
  const again = await begin(other, alice);
  const result = await completeStoreConnection(callback(other, again.state), again.browserBinding, {
    db,
    exchangeCode: grant,
    registerWebhooks: async () => {
      throw new Error("Shopify unreachable");
    },
  });
  assert.ok(result.ok);
});

test("only the owner can disconnect a store; disconnecting stops it and hides its products", async () => {
  const alice = await newUser();
  const shop = uniqueShop();
  const merchantId = await connect(shop, alice);
  await db.insert(products).values({
    merchantId,
    externalId: "mug",
    name: "Stone mug",
    priceMinor: 1200,
    currency: "USD",
    inventory: 3,
    productUrl: `https://${shop}/products/mug`,
  });

  assert.equal(await disconnectStore(await newUser(), merchantId, db), false);
  const connectionOf = async () =>
    (
      await db
        .select()
        .from(merchantConnections)
        .where(eq(merchantConnections.merchantId, merchantId))
    )[0];
  assert.equal((await connectionOf()).enabled, true);

  assert.equal(await disconnectStore(alice, merchantId, db), true);
  const connection = await connectionOf();
  assert.equal(connection.enabled, false);
  assert.equal(connection.credentialsEncrypted, null);
  const [product] = await db.select().from(products).where(eq(products.merchantId, merchantId));
  assert.equal(product.active, false);

  // Reconnecting restores it.
  await connect(shop, alice);
  assert.equal((await connectionOf()).enabled, true);
});
