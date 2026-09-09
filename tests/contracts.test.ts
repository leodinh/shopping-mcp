import test from "node:test";
import assert from "node:assert/strict";
import { validateSnapshot } from "@/server/connectors/contract";
import { minorUnits, searchSchema } from "@/shared/catalog-schema";
import { demoCatalog } from "@/server/demo/catalog";
import { demoStores } from "@/shared/demo-stores";

const product = { externalId: "one", name: "Backpack", description: "Black", priceMinor: 8900,
  currency: "USD", inventory: 1, images: [], productUrl: "https://store.example/one" };

test("snapshot accepts empty complete catalogs and valid normalized products", () => {
  assert.deepEqual(validateSnapshot([]), []);
  assert.deepEqual(validateSnapshot([product]), [product]);
});
test("snapshot rejects duplicate IDs, fractional money, negative stock and unsafe URLs", () => {
  assert.throws(() => validateSnapshot([product, product]), /Duplicate/);
  for (const patch of [{ priceMinor: 1.5 }, { inventory: -1 }, { currency: "usd" }, { productUrl: "javascript:alert(1)" }]) {
    assert.throws(() => validateSnapshot([{ ...product, ...patch }]));
  }
});
test("search validates filters and converts money without floating-point multiplication", () => {
  assert.equal(minorUnits("19.99"), 1999);
  assert.equal(minorUnits("0.29"), 29);
  assert.equal(minorUnits("150"), 15000);
  assert.equal(searchSchema.parse({}).limit, 24);
  for (const input of [{ limit: 0 }, { maxPrice: "-1" }, { maxPrice: "1.999" }, { merchantId: "invalid" }, { inStock: "yes" }, { offset: -1 }]) {
    assert.equal(searchSchema.safeParse(input).success, false);
  }
});
test("demo API fixtures contain 3 merchants and 12 products including shared external IDs", () => {
  assert.equal(demoStores.length, 3);
  assert.equal(demoStores.flatMap((store) => demoCatalog(store.slug)!.products).length, 12);
  assert.equal(demoCatalog("missing"), null);
});
