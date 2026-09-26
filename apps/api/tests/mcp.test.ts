import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { searchSchema } from "@shopping-mcp/contracts";
import { searchProductsInput, toCatalogSearch } from "../src/mcp/tools/search-products";
import { compareProductsInput } from "../src/mcp/tools/compare-products";
test("MCP search input maps to catalog query-string filters", () => {
  const mapped = toCatalogSearch(
    searchProductsInput.parse({ q: "backpack", maxPrice: 100, inStock: true, limit: 5 }),
  );
  assert.deepEqual(mapped, {
    q: "backpack",
    merchantId: undefined,
    currency: "USD",
    maxPrice: "100",
    inStock: "true",
    limit: 5,
    offset: 0,
  });
  assert.equal(searchSchema.safeParse(mapped).success, true);
});

test("MCP compare accepts two distinct product IDs", () => {
  assert.equal(
    compareProductsInput.safeParse({ productIds: [randomUUID(), randomUUID()] }).success,
    true,
  );
});
