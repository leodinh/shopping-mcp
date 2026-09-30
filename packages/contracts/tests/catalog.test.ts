import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { productIdsSchema, searchSchema } from "@shopping-mcp/contracts";

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
    { offset: -1 },
  ]) {
    assert.equal(searchSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});

test("product IDs are 2–5 distinct UUIDs, case-insensitively", () => {
  const id = randomUUID();
  assert.equal(productIdsSchema.safeParse([id, randomUUID()]).success, true);
  for (const ids of [
    [id],
    [id, id],
    [id, id.toUpperCase()],
    Array.from({ length: 6 }, randomUUID),
  ]) {
    assert.equal(productIdsSchema.safeParse(ids).success, false);
  }
});
