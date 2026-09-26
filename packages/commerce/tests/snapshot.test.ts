import test from "node:test";
import assert from "node:assert/strict";
import { validateSnapshot } from "@shopping-mcp/commerce/connectors";
const product = {
  externalId: "one",
  name: "Backpack",
  description: "Black",
  priceMinor: 8900,
  currency: "USD",
  inventory: 1,
  images: [],
  productUrl: "https://store.example/one",
};

test("snapshot accepts empty complete catalogs and valid normalized products", () => {
  assert.deepEqual(validateSnapshot([]), []);
  assert.deepEqual(validateSnapshot([product]), [product]);
});
test("snapshot rejects duplicate IDs, fractional money, negative stock and unsafe URLs", () => {
  assert.throws(() => validateSnapshot([product, product]), /Duplicate/);
  for (const patch of [
    { priceMinor: 1.5 },
    { inventory: -1 },
    { currency: "usd" },
    { productUrl: "javascript:alert(1)" },
  ]) {
    assert.throws(() => validateSnapshot([{ ...product, ...patch }]));
  }
});
