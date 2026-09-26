import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { compareProducts, getProductById } from "@shopping-mcp/commerce/catalog";
import { toCatalogProduct } from "../src/catalog/dto";
import { minorUnits } from "../src/catalog/money";
test("compare and get-product reject invalid IDs before querying", async () => {
  const id = randomUUID();
  await assert.rejects(() => getProductById("not-a-uuid"), ZodError);
  await assert.rejects(() => compareProducts([id]), ZodError);
  await assert.rejects(() => compareProducts([id, id]), ZodError);
  await assert.rejects(() => compareProducts([id.toUpperCase(), id]), ZodError);
  await assert.rejects(
    () => compareProducts([...Array.from({ length: 6 }, () => randomUUID())]),
    ZodError,
  );
});
test("catalog DTO converts Date updatedAt to an ISO string", () => {
  const dto = toCatalogProduct({
    id: "00000000-0000-0000-0000-000000000001",
    externalId: "one",
    name: "Backpack",
    description: "Black",
    priceMinor: 8900,
    currency: "USD",
    images: [],
    inventory: 1,
    productUrl: "https://store.example/one",
    updatedAt: new Date("2026-09-13T18:00:00.000Z"),
    merchant: { id: "00000000-0000-0000-0000-000000000002", name: "Demo", slug: "demo" },
  });
  assert.equal(typeof dto.updatedAt, "string");
  assert.equal(dto.updatedAt, "2026-09-13T18:00:00.000Z");
});

test("money converts without floating-point multiplication", () => {
  assert.equal(minorUnits("19.99"), 1999);
  assert.equal(minorUnits("0.29"), 29);
  assert.equal(minorUnits("150"), 15000);
});
