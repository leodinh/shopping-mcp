import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { listStoresForUser } from "@shopping-mcp/commerce/merchants";
import { user } from "@shopping-mcp/database";
import { createTestDatabase } from "@shopping-mcp/database/testing";
import { handleShopifyCallback } from "../../src/shopify/callback";
import { handleShopifyConnect } from "../../src/shopify/connect";

process.env.CREDENTIALS_KEY = "test-credentials-key-32-characters-min";
process.env.SHOPIFY_API_KEY = "test-key";
process.env.SHOPIFY_API_SECRET = "test-secret";
process.env.SHOPIFY_SCOPES = "read_products";
process.env.SHOPIFY_REDIRECT_URI = "http://127.0.0.1:3001/api/connections/shopify/callback";
process.env.WEB_ORIGIN = "http://localhost:3000";

function signedCallbackQuery(params: Record<string, string>) {
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const hmac = createHmac("sha256", "test-secret").update(message).digest("hex");
  return new URLSearchParams({ ...params, hmac }).toString();
}

const connectRequest = (shop: string) =>
  new Request("http://localhost:3001/api/shopify/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shop }),
  });

test("connecting a shop requires a signed-in User", async () => {
  const response = await handleShopifyConnect(connectRequest("ui-shop.myshopify.com"), null);
  assert.equal(response.status, 401);
});

test("a signed-in User connects a shop over HTTP and returns to their profile owning it", async () => {
  const { db, drop } = await createTestDatabase("shopify_http");
  try {
    const [alice] = await db
      .insert(user)
      .values({ name: "", email: `alice-${randomUUID()}@example.test` })
      .returning({ id: user.id });
    const deps = {
      db,
      exchangeCode: async () => ({
        accessToken: "shpat_ui",
        scope: "read_products",
        expiresAt: null,
        refreshTokenExpiresAt: null,
      }),
    };
    const started = await handleShopifyConnect(
      connectRequest("ui-shop.myshopify.com"),
      alice.id,
      deps,
    );
    assert.equal(started.status, 200);
    const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
    const state = new URL(authorizationUrl).searchParams.get("state")!;
    const binding = started.headers.getSetCookie().find((c) => c.startsWith("oauth_binding="));
    assert.match(
      binding ?? "",
      /^oauth_binding=[0-9a-f]{32}; HttpOnly; Path=\/; Max-Age=(599|600); SameSite=Lax$/,
    );

    const query = signedCallbackQuery({
      shop: "ui-shop.myshopify.com",
      code: "ui-code",
      state,
      timestamp: "1710000000",
    });
    const callback = await handleShopifyCallback(
      new Request(`http://localhost:3001/api/connections/shopify/callback?${query}`, {
        headers: { cookie: binding!.split(";")[0] },
      }),
      deps,
    );
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), "http://localhost:3000/profile");
    // Shopify only authorizes the store; it never signs anyone in.
    assert.equal(callback.headers.getSetCookie().length, 0);

    const stores = await listStoresForUser(alice.id, db);
    assert.deepEqual(
      stores.map((store) => store.slug),
      ["ui-shop.myshopify.com"],
    );
  } finally {
    await drop();
  }
});
