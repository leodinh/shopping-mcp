import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { connectSearchCache } from "@shopping-mcp/commerce/catalog";
import { encryptCredentials } from "@shopping-mcp/commerce/connectors/shopify";
import { database, merchantConnections, merchants, pool } from "@shopping-mcp/database";
import { createApi } from "../../src/create-api";

const url = process.env.REDIS_URL;
// Required in CI: a missing Redis must fail the build, not silently skip these tests.
if (!url && process.env.CI)
  throw new Error("REDIS_URL is required for Redis integration tests in CI");
const skip = url ? false : "REDIS_URL not set (docker compose up -d redis)";

let app: Awaited<ReturnType<typeof createApi>>;
let merchantId: string;
let shopifyCalls = 0;
const realFetch = globalThis.fetch;
const shop = `cache-${randomUUID().slice(0, 8)}.myshopify.com`;

before(async () => {
  if (skip) return;
  // Shopify is never reached: this answers the seeded store's searches and counts them.
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    if (!target.hostname.endsWith(".myshopify.com")) return realFetch(input, init);
    if (target.hostname === shop) shopifyCalls += 1;
    return Response.json({
      data: {
        shop: { currencyCode: "USD" },
        products: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } },
      },
    });
  }) as typeof fetch;
  const [merchant] = await database()
    .insert(merchants)
    .values({ slug: shop, name: "Cache Check", websiteUrl: `https://${shop}` })
    .returning({ id: merchants.id });
  merchantId = merchant.id;
  await database()
    .insert(merchantConnections)
    .values({
      merchantId,
      connectorType: "shopify",
      config: { shop },
      shopDomain: shop,
      credentialsEncrypted: encryptCredentials({ accessToken: "shpat_cache_test" }),
      verifiedAt: new Date(),
    });
  app = await createApi(); // the search cache connects while the API starts
  await new Promise((resolve) => setTimeout(resolve, 300));
});

after(async () => {
  if (skip) return;
  globalThis.fetch = realFetch;
  await pool().query("DELETE FROM merchants WHERE id = $1", [merchantId]);
  await app.close();
});

test("the search cache is connected when the API starts, before any search", { skip }, () => {
  // Opened lazily by the first search, it wasn't ready in time, so that search was never cached.
  assert.equal(connectSearchCache()?.ready, true);
});

test(
  "the first search after startup is cached, so the next identical one is a hit",
  { skip },
  async () => {
    const path = `/api/products?q=${randomUUID()}&merchantId=${merchantId}`;
    const first = await request(app.getHttpServer()).get(path);
    const second = await request(app.getHttpServer()).get(path);
    assert.equal(first.status, 200, first.text);
    assert.deepEqual(
      [first.body.stores[0]?.outcome, second.body.stores[0]?.outcome],
      ["cache_miss", "cache_hit"],
    );
    assert.equal(second.body.stores[0].fetchedAt, first.body.stores[0].fetchedAt);
    assert.equal(shopifyCalls, 1, "the store was asked once");
  },
);
