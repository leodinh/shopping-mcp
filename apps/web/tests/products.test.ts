import test from "node:test";
import assert from "node:assert/strict";
import type { CatalogProduct, SearchResult } from "@shopping-mcp/contracts";
import { browseHref, readBrowse, searchKey } from "../src/features/products/browse";
import { formatPrice, priceLabel, purchaseUrl } from "../src/features/products/format";
import { CURSOR_MAX_AGE_MS, cachedPage, nextStep, record } from "../src/features/products/history";
import { fetchResults, loadProduct, ResultsError } from "../src/features/products/api";

const product = (overrides: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: "shopify:6f1c1b7e-2f4a-4c55-9d7e-1b2c3d4e5f60:42",
  provider: "shopify",
  externalId: "42",
  name: "Harbor Daypack",
  description: "x".repeat(1000),
  price: { amountMinor: 8900, currency: "USD" },
  available: true,
  brand: null,
  gtin: null,
  sku: null,
  images: [],
  productUrl: "https://store.example/products/harbor",
  variants: [],
  merchant: { id: "6f1c1b7e-2f4a-4c55-9d7e-1b2c3d4e5f60", name: "Harbor", slug: "harbor" },
  fetchedAt: "2026-10-27T00:00:00.000Z",
  ...overrides,
});

const page = (nextCursor: string | null): SearchResult => ({
  products: [product()],
  nextCursor,
  hasMore: nextCursor !== null,
  partial: false,
  unavailable: [],
  stores: [],
});

test("the URL carries the search, its filters, the page and the view, and reads back the same", () => {
  const href = browseHref(
    { q: "rain jacket", inStock: "true", currency: "EUR", maxPrice: "80" },
    { page: 3, view: "list" },
  );
  assert.equal(
    href,
    "/products?q=rain+jacket&currency=EUR&maxPrice=80&inStock=true&page=3&view=list",
  );
  const back = readBrowse(new URL(href, "http://web").searchParams);
  assert.deepEqual(back, {
    query: { q: "rain jacket", currency: "EUR", maxPrice: "80", inStock: "true" },
    page: 3,
    view: "list",
  });
  assert.deepEqual(readBrowse(new URLSearchParams("page=-2&view=tiles&cursor=x&limit=5")), {
    query: {},
    page: 1,
    view: "grid",
  });
  assert.equal(
    browseHref({ q: "mug", inStock: "false" }),
    "/products?q=mug",
    "defaults are left out",
  );
  assert.equal(
    searchKey({ inStock: "true", q: "mug" }),
    searchKey({ q: "mug", inStock: "true" }),
    "one key per search",
  );
});

test("pages come from the cache, or with the previous page's cursor while it's fresh", () => {
  const now = 1_000_000_000;
  let history = record(null, "q=mug", 1, page("c1"), now);
  assert.equal(history.pages[0].result.products[0].description.length, 400, "kept as an excerpt");
  assert.deepEqual(nextStep(history, "q=mug", 2, now), { kind: "fetch", cursor: "c1" });
  history = record(history, "q=mug", 2, page("c2"), now);
  assert.ok(cachedPage(history, "q=mug", 2));
  assert.equal(cachedPage(history, "q=bag", 2), undefined, "another search");

  assert.deepEqual(nextStep(history, "q=mug", 1, now), { kind: "fetch", cursor: null });
  assert.deepEqual(nextStep(history, "q=mug", 5, now), { kind: "restart" }, "a gap");
  assert.deepEqual(nextStep(null, "q=mug", 2, now), { kind: "restart" }, "a shared link");
  assert.deepEqual(
    nextStep(history, "q=mug", 3, now + CURSOR_MAX_AGE_MS + 1),
    { kind: "restart" },
    "an expired cursor",
  );
  assert.deepEqual(nextStep(record(null, "q=mug", 1, page(null), now), "q=mug", 2, now), {
    kind: "restart",
  });

  // A new search replaces the old one's pages.
  const other = record(history, "q=bag", 1, page(null), now);
  assert.equal(other.pages.length, 1);
  assert.equal(other.key, "q=bag");
});

test("prices follow the currency's own minor units, and say From when variants differ", () => {
  assert.equal(formatPrice({ amountMinor: 1999, currency: "USD" }), "$19.99");
  assert.equal(formatPrice({ amountMinor: 1500, currency: "JPY" }), "¥1,500");
  assert.match(formatPrice({ amountMinor: 1234, currency: "KWD" }), /^KWD\s1\.234$/);
  const variant = (amountMinor: number) => ({
    id: String(amountMinor),
    title: "Size",
    price: { amountMinor, currency: "USD" },
    available: true,
  });
  assert.equal(priceLabel(product({ variants: [variant(8900), variant(8900)] })), "$89.00");
  assert.equal(priceLabel(product({ variants: [variant(8900), variant(9900)] })), "From $89.00");
});

test("only web addresses become a purchase link", () => {
  assert.equal(purchaseUrl("https://store.example/p/1"), "https://store.example/p/1");
  for (const bad of ["javascript:alert(1)", "/products/1", "", "store.example"]) {
    assert.equal(purchaseUrl(bad), null, bad);
  }
});

test("search pages are parsed; refused parameters and outages are told apart", async (context) => {
  const fetch = context.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      assert.equal(url, "http://localhost:3001/api/products?q=mug&cursor=c1");
      assert.equal(options.credentials, "include");
      return Response.json(page(null));
    },
  );
  assert.equal((await fetchResults({ q: "mug" }, "c1")).products.length, 1);

  fetch.mock.mockImplementation(async () => Response.json({ error: "expired" }, { status: 400 }));
  await assert.rejects(
    fetchResults({ q: "mug" }, "c1"),
    (error: ResultsError) => error.kind === "invalid",
  );
  fetch.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(
    fetchResults({ q: "mug" }, null),
    (error: ResultsError) => error.kind === "unavailable",
  );
  fetch.mock.mockImplementation(async () => Response.json({ products: "nope" }));
  await assert.rejects(fetchResults({ q: "mug" }, null));
});

test("a product that doesn't exist is null; a store that doesn't answer throws", async (context) => {
  const id = product().id;
  const fetch = context.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, `http://localhost:3001/api/products/${encodeURIComponent(id)}`);
    return Response.json({ product: product() });
  });
  assert.equal((await loadProduct(id))?.name, "Harbor Daypack");
  fetch.mock.mockImplementation(async () =>
    Response.json({ error: "Product not found" }, { status: 404 }),
  );
  assert.equal(await loadProduct(id), null);
  fetch.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(loadProduct(id));
});
