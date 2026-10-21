import test from "node:test";
import assert from "node:assert/strict";
import { shopifyShopExists } from "../src/store-connection/shopify";

/** Answers every request with `status`, or throws when it's an Error; records the request. */
function shopify(answer: number | Error) {
  const seen: Array<{ url: string; redirect?: RequestInit["redirect"] }> = [];
  const send = (async (url: string, init?: RequestInit) => {
    seen.push({ url, redirect: init?.redirect });
    if (answer instanceof Error) throw answer;
    return new Response(null, { status: answer });
  }) as typeof fetch;
  return { send, seen };
}

test("only a definite 404 means the shop doesn't exist", async () => {
  const { send, seen } = shopify(404);
  assert.equal(await shopifyShopExists("gone.myshopify.com", send), false);
  assert.deepEqual(seen, [
    { url: "https://gone.myshopify.com/admin/oauth/authorize", redirect: "manual" },
  ]);
});

test("anything else lets the connection go ahead, so a real store is never blocked", async () => {
  // 303: a real shop sending the owner to log in. 200/302: other live answers. 402/403/429/
  // 500/503: closed, bot-protected, rate-limited or failing: Shopify's own page handles those.
  for (const status of [200, 302, 303, 402, 403, 429, 500, 503]) {
    assert.equal(
      await shopifyShopExists("live.myshopify.com", shopify(status).send),
      true,
      `${status}`,
    );
  }
  for (const error of [
    new TypeError("fetch failed"),
    new DOMException("timeout", "TimeoutError"),
  ]) {
    assert.equal(
      await shopifyShopExists("live.myshopify.com", shopify(error).send),
      true,
      error.name,
    );
  }
});
