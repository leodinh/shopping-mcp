import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CatalogProduct } from "@shopping-mcp/contracts";
import { getCheckout, type ProductSearchService } from "@shopping-mcp/commerce/catalog";

const merchantId = randomUUID();
const id = `shopify:${merchantId}:42`;

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id,
    provider: "shopify",
    externalId: "42",
    name: "Stone mug",
    description: "",
    price: { amountMinor: 1250, currency: "USD" },
    available: true,
    brand: null,
    gtin: null,
    sku: null,
    images: [],
    productUrl: "https://store.example/products/mug",
    variants: [],
    merchant: { id: merchantId, name: "Northline", slug: "northline" },
    fetchedAt: "2026-10-22T10:00:00.000Z",
    ...overrides,
  };
}

/** A search service whose lookup answers `result`, recording what was asked. */
function lookups(result: Awaited<ReturnType<ProductSearchService["get"]>>) {
  const asked: Array<{ ids: string[]; country?: string }> = [];
  const service = {
    search: () => assert.fail("checkout never searches"),
    async get(ids: string[], options?: { country?: string }) {
      asked.push({ ids, country: options?.country });
      return result;
    },
  } as ProductSearchService;
  return { service, asked };
}

test("checkout validates the current offer: live price and availability, with their time", async () => {
  const { service, asked } = lookups({ products: [product()], unavailable: [] });
  const result = await getCheckout(id, { country: "CA" }, service);
  assert.ok(result.ok);
  assert.deepEqual(result.checkout.offer, {
    price: { amountMinor: 1250, currency: "USD" },
    available: true,
    fetchedAt: "2026-10-22T10:00:00.000Z",
  });
  assert.equal(result.checkout.productUrl, "https://store.example/products/mug");
  assert.deepEqual(asked, [{ ids: [id], country: "CA" }], "asked live, in the buyer's market");
});

test("no offer for a product that's gone, sold out, or whose store didn't answer", async () => {
  const gone = await getCheckout(id, {}, lookups({ products: [], unavailable: [] }).service);
  assert.deepEqual(gone, { ok: false, reason: "not_found" });
  const soldOut = await getCheckout(
    id,
    {},
    lookups({ products: [product({ available: false })], unavailable: [] }).service,
  );
  assert.deepEqual(soldOut, { ok: false, reason: "unavailable" });
  const silent = await getCheckout(
    id,
    {},
    lookups({ products: [], unavailable: [{ merchantId, name: "Northline" }] }).service,
  );
  assert.deepEqual(silent, { ok: false, reason: "store_unavailable" });
});
