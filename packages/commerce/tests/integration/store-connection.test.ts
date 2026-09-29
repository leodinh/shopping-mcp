import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { requireSession } from "@shopping-mcp/commerce/auth";
import { decryptCredentials } from "@shopping-mcp/commerce/connectors/shopify";
import {
  beginStoreConnection,
  completeStoreConnection,
  type ExchangeCode,
} from "@shopping-mcp/commerce/store-connection";
import {
  merchantConnections,
  merchants,
  oauthAttempts,
  sessions,
  syncRuns,
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

function signed(params: Record<string, string>, secret = "test-secret") {
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const hmac = createHmac("sha256", secret).update(message).digest("hex");
  return new URLSearchParams({ ...params, hmac });
}

async function begin(shop: string, merchantId: string | null = null) {
  const result = await beginStoreConnection(shop, merchantId, { db });
  assert.ok(result.ok, `begin failed: ${JSON.stringify(result)}`);
  const state = new URL(result.authorizationUrl).searchParams.get("state")!;
  return { ...result, state };
}

function callback(shop: string, state: string, code = "auth-code") {
  return signed({ shop, code, state, timestamp: "1710000000" });
}

async function newMerchant() {
  const [row] = await db
    .insert(merchants)
    .values({ slug: `m-${randomUUID()}`, name: "Northline", websiteUrl: "https://n.example" })
    .returning({ id: merchants.id });
  return row.id;
}

async function connect(shop: string, merchantId: string | null = null) {
  const started = await begin(shop, merchantId);
  const done = await completeStoreConnection(
    callback(shop, started.state),
    started.browserBinding,
    {
      db,
      exchangeCode: grant,
    },
  );
  assert.ok(done.ok, `complete failed: ${JSON.stringify(done)}`);
  return done.sessionToken;
}

test("anonymous connect creates the Merchant, stores credentials, requests a sync, and signs in", async () => {
  const shop = uniqueShop();
  const started = await begin(` https://${shop.toUpperCase()}/admin `);
  assert.equal(
    started.authorizationUrl,
    `https://${shop}/admin/oauth/authorize?client_id=test-key&scope=read_products&redirect_uri=http%3A%2F%2F127.0.0.1%3A3001%2Fapi%2Fconnections%2Fshopify%2Fcallback&state=${started.state}`,
  );
  assert.match(started.browserBinding, /^[0-9a-f]{32}$/);
  const ttl = started.expiresAt.getTime() - Date.now();
  assert.ok(ttl > 9 * 60_000 && ttl <= 10 * 60_000);

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

  const merchantId = await requireSession(done.sessionToken, db);
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
  assert.equal(merchant.slug, shop);
  const [connection] = await db
    .select()
    .from(merchantConnections)
    .where(eq(merchantConnections.merchantId, merchantId));
  assert.equal(connection.shopDomain, shop);
  assert.equal(connection.scopes, "read_products");
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
  for (const shop of [
    "",
    "example.com",
    "https://example.com",
    "example.myshopify.com.attacker.example",
    "https://attacker.example/?shop=x.myshopify.com",
    123,
    null,
  ]) {
    assert.deepEqual(await beginStoreConnection(shop, null, { db }), {
      ok: false,
      reason: "invalid_shop",
    });
  }
});

test("complete rejects a tampered HMAC, a stolen browser binding, and an expired attempt", async () => {
  const shop = uniqueShop();
  const started = await begin(shop);
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

test("a shop belongs to one Merchant: begin, complete, and a lost race all report shop_taken", async () => {
  const shop = uniqueShop();
  const owner = await newMerchant();
  const rival = await newMerchant();

  const rivalStarted = await begin(shop, rival);
  await connect(shop, owner);

  assert.deepEqual(await beginStoreConnection(shop, rival, { db }), {
    ok: false,
    reason: "shop_taken",
  });
  assert.deepEqual(
    await completeStoreConnection(callback(shop, rivalStarted.state), rivalStarted.browserBinding, {
      db,
      exchangeCode: mustNotExchange,
    }),
    { ok: false, reason: "shop_taken" },
  );

  const raced = uniqueShop();
  const slow = await begin(raced, rival);
  const result = await completeStoreConnection(callback(raced, slow.state), slow.browserBinding, {
    db,
    // The owner finishes connecting the same shop while Shopify is still answering the rival.
    exchangeCode: async (s, code) => {
      await connect(raced, await newMerchant());
      return grant(s, code);
    },
  });
  assert.deepEqual(result, { ok: false, reason: "shop_taken" });
});

test("a Merchant never switches shops, but can reconnect its own", async () => {
  const merchantId = await newMerchant();
  const shop = uniqueShop();
  await connect(shop, merchantId);

  assert.deepEqual(await beginStoreConnection(uniqueShop(), merchantId, { db }), {
    ok: false,
    reason: "shop_mismatch",
  });
  await connect(shop, merchantId);
});

test("without a signed-in Merchant, begin acts for the Merchant that already owns the shop", async () => {
  const merchantId = await newMerchant();
  const shop = uniqueShop();
  await connect(shop, merchantId);

  const sessionToken = await connect(shop, null);
  assert.equal(await requireSession(sessionToken, db), merchantId);
});

test("a failed token exchange stores nothing and uses up the attempt", async () => {
  const shop = uniqueShop();
  const started = await begin(shop);
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
  const connections = await db
    .select()
    .from(merchantConnections)
    .where(eq(merchantConnections.shopDomain, shop));
  assert.equal(connections.length, 0);
  const signedIn = await db
    .select()
    .from(sessions)
    .where(eq(sessions.merchantId, attempt.merchantId));
  assert.equal(signedIn.length, 0);

  assert.deepEqual(
    await completeStoreConnection(callback(shop, started.state), started.browserBinding, deps),
    { ok: false, reason: "invalid_state" },
  );
});
