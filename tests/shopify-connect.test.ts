import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { normalizeShopDomain, shopifyAuthorizeUrl } from "@/server/shopify/connect";
import { readSessionCookie, signSessionCookie } from "@/server/auth/session";

process.env.SESSION_SECRET = "test-session-secret-32-characters-min";
process.env.SHOPIFY_API_KEY = "test-key";
process.env.SHOPIFY_SCOPES = "read_products";
process.env.SHOPIFY_REDIRECT_URI = "http://127.0.0.1:3000/api/shopify/callback";

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

test("session cookie round-trips and rejects missing, tampered, or expired values", () => {
  const sessionId = randomUUID();
  const value = signSessionCookie(sessionId);
  assert.equal(readSessionCookie(`session=${value}`), sessionId);
  assert.throws(() => readSessionCookie(null), /Unauthorized/);
  assert.throws(() => readSessionCookie("demo-store=northline"), /Unauthorized/);
  const tampered = value.slice(0, -1) + (value.endsWith("a") ? "b" : "a");
  assert.throws(() => readSessionCookie(`session=${tampered}`), /Unauthorized/);
  assert.throws(
    () => readSessionCookie(`session=${signSessionCookie(sessionId, Date.now() - 1)}`),
    /Unauthorized/,
  );
});

test("builds the Shopify admin OAuth authorize URL", () => {
  assert.equal(
    shopifyAuthorizeUrl("example-shop.myshopify.com", "abc123"),
    "https://example-shop.myshopify.com/admin/oauth/authorize?client_id=test-key&scope=read_products&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fapi%2Fshopify%2Fcallback&state=abc123",
  );
});
