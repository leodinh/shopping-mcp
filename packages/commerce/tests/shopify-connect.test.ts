import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  normalizeShopDomain,
  shopifyAuthorizeUrl,
  verifyShopifyHmac,
} from "@shopping-mcp/commerce/connectors/shopify";

process.env.SESSION_SECRET = "test-session-secret-32-characters-min";
process.env.SHOPIFY_API_KEY = "test-key";
process.env.SHOPIFY_API_SECRET = "test-secret";
process.env.SHOPIFY_SCOPES = "read_products";
process.env.SHOPIFY_REDIRECT_URI = "http://127.0.0.1:3001/api/connections/shopify/callback";

test("normalizes *.myshopify.com hostnames and rejects everything else", () => {
  assert.equal(normalizeShopDomain("Example-Shop.myshopify.com"), "example-shop.myshopify.com");
  assert.equal(
    normalizeShopDomain("https://example-shop.myshopify.com/admin"),
    "example-shop.myshopify.com",
  );
  assert.equal(normalizeShopDomain(" example-shop.myshopify.com "), "example-shop.myshopify.com");
  for (const shop of [
    "",
    "example.com",
    "https://example.com",
    "example.myshopify.com.attacker.example",
    "https://attacker.example/?shop=x.myshopify.com",
    123,
    null,
  ]) {
    assert.throws(() => normalizeShopDomain(shop), /Invalid shop domain/);
  }
});

test("builds the Shopify admin OAuth authorize URL", () => {
  assert.equal(
    shopifyAuthorizeUrl("example-shop.myshopify.com", "abc123"),
    "https://example-shop.myshopify.com/admin/oauth/authorize?client_id=test-key&scope=read_products&redirect_uri=http%3A%2F%2F127.0.0.1%3A3001%2Fapi%2Fconnections%2Fshopify%2Fcallback&state=abc123",
  );
});

test("accepts a valid Shopify HMAC and rejects a tampered one", () => {
  const params = { shop: "example-shop.myshopify.com", code: "abc", state: "s", timestamp: "1" };
  const hmac = createHmac("sha256", "test-secret")
    .update(
      Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key as keyof typeof params]}`)
        .join("&"),
    )
    .digest("hex");
  verifyShopifyHmac(new URLSearchParams({ ...params, hmac }));
  assert.throws(
    () => verifyShopifyHmac(new URLSearchParams({ ...params, shop: "evil.myshopify.com", hmac })),
    /Invalid HMAC/,
  );
});
