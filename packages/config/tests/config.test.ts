import test from "node:test";
import assert from "node:assert/strict";
import { profileUrl, shopifyRedirectUri, webOrigin } from "@shopping-mcp/config";

test("profile URL uses WEB_ORIGIN so OAuth bounce leaves the API host", () => {
  const previous = process.env.WEB_ORIGIN;
  process.env.WEB_ORIGIN = "http://127.0.0.1:3000";
  try {
    assert.equal(webOrigin(), "http://127.0.0.1:3000");
    assert.equal(profileUrl(), "http://127.0.0.1:3000/profile");
  } finally {
    if (previous === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = previous;
  }
});

test("Shopify's callback is always on the API's own origin, never a separately configured host", () => {
  const saved = { api: process.env.API_ORIGIN, uri: process.env.SHOPIFY_REDIRECT_URI };
  try {
    // The tunnel case that failed: API on the tunnel, a stale local callback still in .env.
    process.env.API_ORIGIN = "https://shopping-api-dev.leodev.online";
    process.env.SHOPIFY_REDIRECT_URI = "http://127.0.0.1:3001/api/connections/shopify/callback";
    assert.equal(
      shopifyRedirectUri(),
      "https://shopping-api-dev.leodev.online/api/connections/shopify/callback",
    );
  } finally {
    for (const [name, value] of [
      ["API_ORIGIN", saved.api],
      ["SHOPIFY_REDIRECT_URI", saved.uri],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
