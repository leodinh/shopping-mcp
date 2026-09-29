import { after, before, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { decryptCredentials } from "@shopping-mcp/commerce/connectors/shopify";
import { syncConnection } from "@shopping-mcp/commerce/sync";
import { merchantConnections, merchants, type Database } from "@shopping-mcp/database";
import { createTestDatabase } from "@shopping-mcp/database/testing";
import {
  encryptCredentials,
  type ShopifyCredentials,
} from "../../src/connectors/shopify/credentials";

process.env.SESSION_SECRET = "test-session-secret-32-characters-min";
process.env.CREDENTIALS_KEY = "test-credentials-key-32-characters-min";
process.env.SHOPIFY_API_KEY = "test-key";
process.env.SHOPIFY_API_SECRET = "test-secret";

let db: Database;
let pool: Pool;
let drop: () => Promise<void>;
before(async () => ({ db, pool, drop } = await createTestDatabase("token_refresh")));
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

const catalogPage = () =>
  Response.json({
    data: {
      shop: { currencyCode: "USD" },
      products: {
        nodes: [
          {
            id: "gid://shopify/Product/1",
            title: "Stone mug",
            description: "",
            handle: "stone-mug",
            onlineStoreUrl: null,
            images: { nodes: [] },
            variants: { nodes: [{ price: "12.00", inventoryQuantity: 3 }] },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  });

const rotated = () =>
  Response.json({
    access_token: "shpat_new",
    refresh_token: "shprt_new",
    scope: "read_products",
    expires_in: 3600,
    refresh_token_expires_in: 7776000,
  });

/** Stubs Shopify: the token endpoint and the Admin GraphQL catalog. */
function shopify(
  context: TestContext,
  handlers: { token?: () => Response; catalog?: () => Response } = {},
) {
  const seen = { tokenBodies: [] as URLSearchParams[], catalogTokens: [] as string[] };
  context.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/admin/oauth/access_token")) {
      seen.tokenBodies.push(new URLSearchParams(String(init?.body)));
      return (handlers.token ?? (() => assert.fail("unexpected token refresh")))();
    }
    seen.catalogTokens.push(new Headers(init?.headers).get("X-Shopify-Access-Token") ?? "");
    return (handlers.catalog ?? catalogPage)();
  });
  return seen;
}

test("a token that is not about to expire is used as-is", async (context) => {
  const seen = shopify(context);
  for (const tokenExpiresAt of [new Date(Date.now() + HOUR), null]) {
    const { id } = await connection({
      credentials: { accessToken: "shpat_live", refreshToken: "shprt_live" },
      tokenExpiresAt,
    });
    assert.equal((await syncConnection(id, pool)).imported, 1);
  }
  assert.deepEqual(seen.catalogTokens, ["shpat_live", "shpat_live"]);
  assert.equal(seen.tokenBodies.length, 0);
});

test("an expiring token is refreshed and the rotated tokens are stored before fetching", async (context) => {
  const seen = shopify(context, { token: rotated });
  const { id } = await connection({
    credentials: { accessToken: "shpat_old", refreshToken: "shprt_old" },
    tokenExpiresAt: new Date(Date.now() + 60_000),
  });

  assert.equal((await syncConnection(id, pool)).imported, 1);
  assert.equal(seen.tokenBodies[0].get("grant_type"), "refresh_token");
  assert.equal(seen.tokenBodies[0].get("refresh_token"), "shprt_old");
  assert.equal(seen.tokenBodies[0].get("client_secret"), "test-secret");
  assert.deepEqual(seen.catalogTokens, ["shpat_new"]);

  const row = await stored(id);
  assert.deepEqual(decryptCredentials(row.credentialsEncrypted!), {
    accessToken: "shpat_new",
    refreshToken: "shprt_new",
  });
  assert.ok(row.tokenExpiresAt!.getTime() - Date.now() > HOUR - 60_000);
  assert.ok(row.refreshTokenExpiresAt!.getTime() - Date.now() > 89 * 24 * HOUR);
});

test("rotated tokens survive a catalog fetch that fails after the refresh", async (context) => {
  shopify(context, { token: rotated, catalog: () => new Response("down", { status: 502 }) });
  const { id } = await connection({
    credentials: { accessToken: "shpat_old", refreshToken: "shprt_old" },
    tokenExpiresAt: new Date(Date.now() - 1000),
  });

  await assert.rejects(syncConnection(id, pool), /catalog fetch failed/);
  assert.equal(
    decryptCredentials((await stored(id)).credentialsEncrypted!).refreshToken,
    "shprt_new",
  );
});

test("a rejected refresh asks the Merchant to reconnect; an outage does not", async (context) => {
  let status = 401;
  shopify(context, { token: () => Response.json({ error: "invalid_grant" }, { status }) });
  const expired = await connection({
    credentials: { accessToken: "shpat_old", refreshToken: "shprt_gone" },
    tokenExpiresAt: new Date(Date.now() - 1000),
  });
  await assert.rejects(syncConnection(expired.id, pool), /Reconnect your store/);
  assert.equal(
    (await stored(expired.id)).lastError,
    "Shopify access expired. Reconnect your store.",
  );

  status = 503;
  const outage = await connection({
    credentials: { accessToken: "shpat_old", refreshToken: "shprt_ok" },
    tokenExpiresAt: new Date(Date.now() - 1000),
  });
  await assert.rejects(syncConnection(outage.id, pool), (error: Error) => {
    assert.doesNotMatch(error.message, /Reconnect/);
    return true;
  });
  assert.equal(
    decryptCredentials((await stored(outage.id)).credentialsEncrypted!).refreshToken,
    "shprt_ok",
  );
});

test("an expiring token with no refresh token asks the Merchant to reconnect", async (context) => {
  shopify(context);
  const { id } = await connection({
    credentials: { accessToken: "shpat_old" },
    tokenExpiresAt: new Date(Date.now() - 1000),
  });
  await assert.rejects(syncConnection(id, pool), /Reconnect your store/);
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

  assert.equal((await syncConnection(id, pool)).imported, 1);

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
