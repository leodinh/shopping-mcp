import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { validateSnapshot } from "@/server/connectors/contract";
import { minorUnits, searchSchema } from "@/shared/catalog-schema";
import { compareProducts, getProductById } from "@/server/catalog/repository";
import { searchProductsInput, toCatalogSearch } from "@/server/mcp/search-products";
import { compareProductsInput } from "@/server/mcp/compare-products";
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
test("MCP search input maps to catalog query-string filters", () => {
  const mapped = toCatalogSearch(searchProductsInput.parse({ q: "backpack", maxPrice: 100, inStock: true, limit: 5 }));
  assert.deepEqual(mapped, {
    q: "backpack", merchantId: undefined, currency: "USD", maxPrice: "100", inStock: "true", limit: 5, offset: 0,
  });
  assert.equal(searchSchema.safeParse(mapped).success, true);
});
test("compare and get-product reject invalid IDs before querying", async () => {
  const id = randomUUID();
  await assert.rejects(() => getProductById("not-a-uuid"), ZodError);
  await assert.rejects(() => compareProducts([id]), ZodError);
  await assert.rejects(() => compareProducts([id, id]), ZodError);
  await assert.rejects(() => compareProducts([id.toUpperCase(), id]), ZodError);
  await assert.rejects(() => compareProducts([...Array.from({ length: 6 }, () => randomUUID())]), ZodError);
  assert.equal(compareProductsInput.safeParse({ productIds: [id, randomUUID()] }).success, true);
});
