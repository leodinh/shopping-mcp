import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createTestDatabase } from "@shopping-mcp/database/testing";
import { getDashboardMerchant } from "../../src/auth/session";
import { handleShopifyCallback } from "../../src/shopify/callback";
import { handleShopifyConnect } from "../../src/shopify/connect";

process.env.SESSION_SECRET = "test-session-secret-32-characters-min";
process.env.CREDENTIALS_KEY = "test-credentials-key-32-characters-min";
process.env.SHOPIFY_API_KEY = "test-key";
process.env.SHOPIFY_API_SECRET = "test-secret";
process.env.SHOPIFY_SCOPES = "read_products";
process.env.SHOPIFY_REDIRECT_URI = "http://127.0.0.1:3001/api/connections/shopify/callback";
process.env.WEB_ORIGIN = "http://127.0.0.1:3000";

function signedCallbackQuery(params: Record<string, string>) {
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const hmac = createHmac("sha256", "test-secret").update(message).digest("hex");
  return new URLSearchParams({ ...params, hmac }).toString();
}

test("a browser with a stale session connects a shop and lands signed in on the dashboard", async () => {
  const { db, drop } = await createTestDatabase("shopify_http");
  try {
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
      new Request("http://127.0.0.1:3001/api/shopify/connect", {
        method: "POST",
        headers: { cookie: "session=stale.0.bad", "content-type": "application/json" },
        body: JSON.stringify({ shop: "ui-shop.myshopify.com" }),
      }),
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
      new Request(`http://127.0.0.1:3001/api/connections/shopify/callback?${query}`, {
        headers: { cookie: binding!.split(";")[0] },
      }),
      deps,
    );
    assert.equal(callback.status, 200);
    assert.match(await callback.text(), /http:\/\/127\.0\.0\.1:3000\/seller/);
    const session = callback.headers.getSetCookie().find((c) => c.startsWith("session="));
    assert.match(
      session ?? "",
      /^session=[^;]+; HttpOnly; Path=\/; Max-Age=2592000; SameSite=Lax$/,
    );

    const dashboard = await getDashboardMerchant(session!.split(";")[0], db);
    assert.equal(dashboard?.slug, "ui-shop.myshopify.com");
    assert.equal(dashboard?.connectorType, "shopify");
    assert.equal(dashboard?.enabled, true);
  } finally {
    await drop();
  }
});
