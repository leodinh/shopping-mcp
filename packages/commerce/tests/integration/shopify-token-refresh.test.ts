import { after, before, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { decryptCredentials } from "@shopping-mcp/commerce/connectors/shopify";
import { merchantConnections, merchants, type Database } from "@shopping-mcp/database";
import { createTestDatabase } from "@shopping-mcp/database/testing";
import {
  encryptCredentials,
  type ShopifyCredentials,
} from "../../src/connectors/shopify/credentials";
import { shopifyAccessToken, ShopifyReconnectRequired } from "../../src/connectors/shopify/access";

process.env.SESSION_SECRET = "test-session-secret-32-characters-min";
process.env.CREDENTIALS_KEY = "test-credentials-key-32-characters-min";
process.env.SHOPIFY_API_KEY = "test-key";
process.env.SHOPIFY_API_SECRET = "test-secret";

let db: Database;
let drop: () => Promise<void>;
before(async () => ({ db, drop } = await createTestDatabase("token_refresh")));
after(() => drop());

const HOUR = 3600_000;

async function connection(options: {
  credentials: ShopifyCredentials;
  tokenExpiresAt: Date | null;
  encrypted?: string;
}) {
  const shop = `shop-${randomUUID().slice(0, 8)}.myshopify.com`;
  const [merchant] = await db
    .insert(merchants)
    .values({ slug: shop, name: "Northline", websiteUrl: `https://${shop}` })
    .returning({ id: merchants.id });
  const [row] = await db
    .insert(merchantConnections)
    .values({
      merchantId: merchant.id,
      connectorType: "shopify",
      config: { shop },
      shopDomain: shop,
      credentialsEncrypted: options.encrypted ?? encryptCredentials(options.credentials),
      tokenExpiresAt: options.tokenExpiresAt,
    })
    .returning({ id: merchantConnections.id });
  return { id: row.id, shop };
}

async function stored(id: string) {
  const [row] = await db.select().from(merchantConnections).where(eq(merchantConnections.id, id));
  return row;
}

const rotated = () =>
  Response.json({
    access_token: "shpat_new",
    refresh_token: "shprt_new",
    scope: "read_products",
    expires_in: 3600,
    refresh_token_expires_in: 7776000,
  });

/** Stubs Shopify's token endpoint, recording each refresh request. */
function shopify(context: TestContext, token?: () => Response | Promise<Response>) {
  const refreshes: URLSearchParams[] = [];
  context.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    assert.match(String(input), /\/admin\/oauth\/access_token$/);
    refreshes.push(new URLSearchParams(String(init?.body)));
    return (token ?? (() => assert.fail("unexpected token refresh")))();
  });
  return refreshes;
}

test("a token that is not about to expire is used as-is", async (context) => {
  const refreshes = shopify(context);
  for (const tokenExpiresAt of [new Date(Date.now() + HOUR), null]) {
    const { id } = await connection({
      credentials: { accessToken: "shpat_live", refreshToken: "shprt_live" },
      tokenExpiresAt,
    });
    assert.equal(await shopifyAccessToken(id, db), "shpat_live");
  }
  assert.equal(refreshes.length, 0);
});

test("an expiring token is refreshed and the rotated tokens are stored", async (context) => {
  const refreshes = shopify(context, rotated);
  const { id } = await connection({
    credentials: { accessToken: "shpat_old", refreshToken: "shprt_old" },
    tokenExpiresAt: new Date(Date.now() + 60_000),
  });

  assert.equal(await shopifyAccessToken(id, db), "shpat_new");
  assert.equal(refreshes[0].get("grant_type"), "refresh_token");
  assert.equal(refreshes[0].get("refresh_token"), "shprt_old");
  assert.equal(refreshes[0].get("client_secret"), "test-secret");

  const row = await stored(id);
  assert.deepEqual(decryptCredentials(row.credentialsEncrypted!), {
    accessToken: "shpat_new",
    refreshToken: "shprt_new",
  });
  assert.ok(row.tokenExpiresAt!.getTime() - Date.now() > HOUR - 60_000);
  assert.ok(row.refreshTokenExpiresAt!.getTime() - Date.now() > 89 * 24 * HOUR);
});

test("concurrent searches refresh a store's single-use refresh token only once", async (context) => {
  const refreshes = shopify(context, async () => {
    await new Promise((resolve) => setTimeout(resolve, 50)); // others arrive while this runs
    return rotated();
  });
  const { id } = await connection({
    credentials: { accessToken: "shpat_old", refreshToken: "shprt_old" },
    tokenExpiresAt: new Date(Date.now() - 1000),
  });
  const tokens = await Promise.all(Array.from({ length: 5 }, () => shopifyAccessToken(id, db)));
  assert.deepEqual(tokens, Array(5).fill("shpat_new"));
  assert.equal(refreshes.length, 1);
});

test("a rejected refresh disables the connection so the store shows reconnect; an outage does not", async (context) => {
  let status = 401;
  shopify(context, () => Response.json({ error: "invalid_grant" }, { status }));
  const expired = await connection({
    credentials: { accessToken: "shpat_old", refreshToken: "shprt_gone" },
    tokenExpiresAt: new Date(Date.now() - 1000),
  });
  await assert.rejects(shopifyAccessToken(expired.id, db), ShopifyReconnectRequired);
  const disabled = await stored(expired.id);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.credentialsEncrypted, null);
  assert.equal(disabled.lastError, "Shopify access expired. Reconnect your store.");
  await assert.rejects(shopifyAccessToken(expired.id, db), ShopifyReconnectRequired);

  status = 503;
  const outage = await connection({
    credentials: { accessToken: "shpat_old", refreshToken: "shprt_ok" },
    tokenExpiresAt: new Date(Date.now() - 1000),
  });
  await assert.rejects(shopifyAccessToken(outage.id, db), (error: Error) => {
    assert.ok(!(error instanceof ShopifyReconnectRequired));
    return true;
  });
  const kept = await stored(outage.id);
  assert.equal(kept.enabled, true);
  assert.equal(decryptCredentials(kept.credentialsEncrypted!).refreshToken, "shprt_ok");
});

test("an expiring token with no refresh token asks the Merchant to reconnect", async (context) => {
  shopify(context);
  const { id } = await connection({
    credentials: { accessToken: "shpat_old" },
    tokenExpiresAt: new Date(Date.now() - 1000),
  });
  await assert.rejects(shopifyAccessToken(id, db), ShopifyReconnectRequired);
});

test("credentials encrypted with the old SESSION_SECRET key still work and are re-encrypted", async (context) => {
  shopify(context);
  process.env.CREDENTIALS_KEY = process.env.SESSION_SECRET; // produce a legacy ciphertext
  const legacy = encryptCredentials({ accessToken: "shpat_legacy" });
  process.env.CREDENTIALS_KEY = "test-credentials-key-32-characters-min";
  const { id } = await connection({
    credentials: { accessToken: "unused" },
    tokenExpiresAt: null,
    encrypted: legacy,
  });

  assert.equal(await shopifyAccessToken(id, db), "shpat_legacy");

  const sessionSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "a-different-session-secret-no-fallback"; // new key only
  try {
    assert.deepEqual(decryptCredentials((await stored(id)).credentialsEncrypted!), {
      accessToken: "shpat_legacy",
    });
  } finally {
    process.env.SESSION_SECRET = sessionSecret;
  }
});

test("a missing CREDENTIALS_KEY fails instead of silently using the old key", () => {
  const key = process.env.CREDENTIALS_KEY;
  delete process.env.CREDENTIALS_KEY;
  try {
    assert.throws(() => decryptCredentials("anything"), /CREDENTIALS_KEY is required/);
  } finally {
    process.env.CREDENTIALS_KEY = key;
  }
});
