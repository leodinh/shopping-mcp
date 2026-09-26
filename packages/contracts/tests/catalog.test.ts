import test from "node:test";
import assert from "node:assert/strict";
import { searchSchema } from "@shopping-mcp/contracts";
test("search validates filters", () => {
  assert.equal(searchSchema.parse({}).limit, 24);
  for (const input of [
    { limit: 0 },
    { maxPrice: "-1" },
    { maxPrice: "1.999" },
    { merchantId: "invalid" },
    { inStock: "yes" },
    { offset: -1 },
  ]) {
    assert.equal(searchSchema.safeParse(input).success, false);
  }
});
