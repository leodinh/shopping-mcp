import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { compareProducts, getProduct, searchProducts } from "@shopping-mcp/commerce/catalog";

test("lookups and search reject invalid input before reaching any store", async () => {
  const id = `shopify:${randomUUID()}:42`;
  await assert.rejects(() => getProduct("not-a-product-id"), ZodError);
  await assert.rejects(() => getProduct(randomUUID()), ZodError, "old UUID IDs are gone");
  await assert.rejects(() => compareProducts([id]), ZodError);
  await assert.rejects(() => compareProducts([id, id]), ZodError);
  await assert.rejects(() => compareProducts([id.toUpperCase(), id]), ZodError);
  await assert.rejects(() => searchProducts({ maxPrice: 10 }), ZodError);
});
