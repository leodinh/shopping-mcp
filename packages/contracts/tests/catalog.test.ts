import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  formatProductId,
  parseProductId,
  productIdsSchema,
  searchSchema,
} from "@shopping-mcp/contracts";

test("search validates filters in real types", () => {
  assert.equal(searchSchema.parse({}).limit, 24);
  assert.equal(searchSchema.parse({}).currency, undefined, "no hidden currency default");
  for (const maxPrice of [19.999, 0.1 + 0.2, 1e21, 123456789]) {
    const parsed = searchSchema.safeParse({ maxPrice, currency: "USD" });
    assert.equal(parsed.success, true, String(maxPrice));
  }
  const noCurrency = searchSchema.safeParse({ maxPrice: 10 });
  assert.equal(noCurrency.success, false);
  assert.match(noCurrency.error!.issues[0].message, /Set currency when using maxPrice/);
  for (const input of [
    { limit: 0 },
    { maxPrice: -1, currency: "USD" },
    { maxPrice: Number.NaN, currency: "USD" },
    { maxPrice: "10", currency: "USD" },
    { currency: "usd" },
    { merchantId: "invalid" },
    { inStock: "true" },
    { country: "usa" },
    { cursor: "x".repeat(60001) },
  ]) {
    assert.equal(searchSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});

const productId = () =>
  formatProductId({ provider: "shopify", merchantId: randomUUID(), externalId: "42" });

test("a product ID round-trips through its parts and rejects anything else", () => {
  const merchantId = randomUUID();
  const id = formatProductId({ provider: "shopify", merchantId, externalId: "8123456789" });
  assert.equal(id, `shopify:${merchantId}:8123456789`);
  assert.deepEqual(parseProductId(id), {
    provider: "shopify",
    merchantId,
    externalId: "8123456789",
  });
  for (const bad of [
    randomUUID(),
    `ebay:${merchantId}:1`,
    `shopify:${merchantId}:gid://shopify/Product/1`,
    `shopify:not-a-uuid:1`,
    `shopify:${merchantId}:`,
  ]) {
    assert.equal(parseProductId(bad), null, bad);
  }
});

test("compare takes 2–5 distinct product IDs, case-insensitively", () => {
  const id = productId();
  assert.equal(productIdsSchema.safeParse([id, productId()]).success, true);
  for (const ids of [
    [id],
    [id, id],
    [id, id.toUpperCase()],
    Array.from({ length: 6 }, productId),
  ]) {
    assert.equal(productIdsSchema.safeParse(ids).success, false);
  }
});
