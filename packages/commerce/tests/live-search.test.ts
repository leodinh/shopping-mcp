import test from "node:test";
import assert from "node:assert/strict";
import { searchSchema, type SearchInput } from "@shopping-mcp/contracts";
import type {
  ExternalProduct,
  ProductProvider,
  ProviderSearchQuery,
} from "../src/catalog/provider";
import {
  AllStoresUnavailable,
  InvalidCursor,
  LiveProductSearchService,
} from "../src/catalog/search";

const SECRET = "test-cursor-secret";

function product(externalId: string, overrides: Partial<ExternalProduct> = {}): ExternalProduct {
  return {
    provider: "shopify",
    externalId,
    name: `Product ${externalId}`,
    description: "",
    price: { amountMinor: 1000, currency: "USD" },
    available: true,
    brand: null,
    gtin: null,
    sku: null,
    images: [],
    productUrl: `https://store.example/products/${externalId}`,
    variants: [],
    ...overrides,
  };
}

type FakeStore = ProductProvider & {
  calls: Array<{ first: number; after?: string }>;
  fail: boolean;
  delayMs: number;
};

/** A store serving `count` products; its position is the index of the next product. */
function store(index: number, count: number, prefix = String(index)): FakeStore {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const products = Array.from({ length: count }, (_, i) => product(`${prefix}0${i}`));
  const fake: FakeStore = {
    merchant: { id, name: `Store ${index}`, slug: `store-${index}` },
    calls: [],
    fail: false,
    delayMs: 0,
    async search(query: ProviderSearchQuery, signal: AbortSignal) {
      fake.calls.push({ first: query.first, after: query.after });
      if (fake.delayMs) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, fake.delayMs);
          signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)));
        });
      }
      if (fake.fail) throw new Error(`Store ${index} is down`);
      const start = query.after ? Number(query.after) : 0;
      const page = products.slice(start, start + query.first);
      return {
        items: page.map((item, i) => ({ product: item, cursor: String(start + i + 1) })),
        end: String(start + page.length),
        hasMore: start + page.length < products.length,
      };
    },
    async get(externalIds: string[]) {
      if (fake.fail) throw new Error(`Store ${index} is down`);
      return products.filter((item) => externalIds.includes(item.externalId));
    },
  };
  return fake;
}

function service(stores: FakeStore[], options: { now?: () => number; timeoutMs?: number } = {}) {
  return new LiveProductSearchService({
    providers: async ({ merchantIds }) =>
      stores.filter((fake) => !merchantIds || merchantIds.includes(fake.merchant.id)),
    cursorSecret: SECRET,
    timeoutMs: options.timeoutMs ?? 1000,
    now: options.now,
  });
}

const search = (live: LiveProductSearchService, input: SearchInput) =>
  live.search(searchSchema.parse(input));
const names = (result: { products: Array<{ externalId: string }> }) =>
  result.products.map((item) => item.externalId);

test("stores are searched together and merged round-robin, each asked for its share", async () => {
  const stores = [store(1, 10), store(2, 10), store(3, 10)];
  const result = await search(service(stores), { limit: 6 });
  assert.deepEqual(names(result), ["100", "200", "300", "101", "201", "301"]);
  assert.deepEqual(
    stores.map((fake) => fake.calls[0].first),
    [2, 2, 2],
    "ceil(6 / 3)",
  );
  assert.equal(result.hasMore, true);
  assert.equal(result.partial, false);
  assert.ok(result.products[0].id.startsWith(`shopify:${stores[0].merchant.id}:`));
  assert.deepEqual(result.products[0].merchant, stores[0].merchant);
});

test("a store that runs out leaves its turns to stores that still have results", async () => {
  const stores = [store(1, 10), store(2, 1)];
  const result = await search(service(stores), { limit: 5 });
  assert.deepEqual(names(result), ["100", "200", "101", "102", "103"]);
  assert.ok(stores[0].calls.length > 1, "store 1 was asked again to fill the page");
});

test("paging walks every product exactly once, keeping the rotation across pages", async () => {
  const stores = [store(1, 5), store(2, 3), store(3, 4)];
  const live = service(stores);
  const seen: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await search(live, { limit: 4, cursor });
    seen.push(...names(result));
    if (!result.hasMore) {
      assert.equal(result.nextCursor, null);
      break;
    }
    cursor = result.nextCursor!;
  }
  assert.equal(seen.length, 12);
  assert.equal(new Set(seen).size, 12, "no duplicates");
  // Round-robin continues where the previous page stopped: 1,2,3,1 | 2,3,1,2 | 3,1,3,1 …
  assert.deepEqual(seen.slice(0, 8), ["100", "200", "300", "101", "201", "301", "102", "202"]);
});

test("fetched but unreturned products come back on the next page", async () => {
  const stores = [store(1, 10)];
  const live = service(stores);
  const first = await search(live, { limit: 3 });
  const second = await search(live, { limit: 3, cursor: first.nextCursor! });
  assert.deepEqual([...names(first), ...names(second)], ["100", "101", "102", "103", "104", "105"]);
  assert.equal(stores[0].calls[1].after, "3", "resumes after the last product returned");
});

test("a failing store makes the page partial, keeps its place, and is retried next page", async () => {
  const stores = [store(1, 4), store(2, 4)];
  stores[1].fail = true;
  const live = service(stores);
  const first = await search(live, { limit: 2 });
  assert.deepEqual(names(first), ["100", "101"]);
  assert.equal(first.partial, true);
  assert.deepEqual(first.unavailable, [{ merchantId: stores[1].merchant.id, name: "Store 2" }]);
  assert.equal(first.hasMore, true);

  stores[1].fail = false;
  const second = await search(live, { limit: 4, cursor: first.nextCursor! });
  assert.deepEqual(names(second), ["200", "102", "201", "103"], "store 2 resumes from its start");
  assert.equal(second.partial, false);
});

test("a slow store times out instead of holding up the search", async () => {
  const stores = [store(1, 2), store(2, 2)];
  stores[1].delayMs = 5000;
  const started = Date.now();
  const result = await search(service(stores, { timeoutMs: 50 }), { limit: 4 });
  assert.ok(Date.now() - started < 2000);
  assert.deepEqual(names(result), ["100", "101"]);
  assert.equal(result.unavailable[0].name, "Store 2");
});

test("the search fails only when every store fails; no stores is an empty success", async () => {
  const stores = [store(1, 2), store(2, 2)];
  for (const fake of stores) fake.fail = true;
  await assert.rejects(search(service(stores), {}), AllStoresUnavailable);
  assert.deepEqual(await search(service([]), {}), {
    products: [],
    nextCursor: null,
    hasMore: false,
    partial: false,
    unavailable: [],
  });
});

test("a successful empty store is not a failure", async () => {
  const result = await search(service([store(1, 0), store(2, 1)]), {});
  assert.deepEqual(names(result), ["200"]);
  assert.equal(result.partial, false);
  assert.equal(result.hasMore, false);
});

test("merchantId searches one store only", async () => {
  const stores = [store(1, 3), store(2, 3)];
  const result = await search(service(stores), { merchantId: stores[1].merchant.id });
  assert.deepEqual(names(result), ["200", "201", "202"]);
  assert.equal(stores[0].calls.length, 0);
});

test("cursors are rejected when forged, expired, or reused for a different search", async () => {
  let now = Date.now();
  const stores = [store(1, 10)];
  const live = service(stores, { now: () => now });
  const { nextCursor } = await search(live, { q: "mug", limit: 2 });
  const [body, signature] = nextCursor!.split(".");

  // Push this store's position back to replay products: the signature no longer matches.
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  payload.stores[0].a = "0";
  const tampered = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
  await assert.rejects(search(live, { q: "mug", cursor: tampered }), InvalidCursor);
  await assert.rejects(search(live, { q: "bag", cursor: nextCursor! }), InvalidCursor);
  await assert.rejects(
    // Flip a character mid-signature (the last one can carry only padding bits).
    search(service(stores), {
      q: "mug",
      cursor: `${body}.${signature.slice(0, 10)}${signature[10] === "A" ? "B" : "A"}${signature.slice(11)}`,
    }),
    InvalidCursor,
  );
  const otherKey = new LiveProductSearchService({
    providers: async () => stores,
    cursorSecret: "another-secret",
  });
  await assert.rejects(search(otherKey, { q: "mug", cursor: nextCursor! }), InvalidCursor);

  now += 31 * 60 * 1000;
  await assert.rejects(search(live, { q: "mug", cursor: nextCursor! }), /expired/);
});

test("a store that is no longer connected drops out of an ongoing search", async () => {
  const stores = [store(1, 4), store(2, 4)];
  const first = await search(service(stores), { limit: 2 });
  const second = await search(service([stores[0]]), { limit: 4, cursor: first.nextCursor! });
  assert.deepEqual(names(second), ["101", "102", "103"]);
  assert.equal(second.hasMore, false);
});

test("at most `concurrency` stores are asked at once", async () => {
  let inFlight = 0;
  let peak = 0;
  const stores = Array.from({ length: 6 }, (_, i) => {
    const fake = store(i + 1, 1);
    const search = fake.search.bind(fake);
    fake.search = async (query, signal) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight--;
      return search(query, signal);
    };
    return fake;
  });
  const live = new LiveProductSearchService({
    providers: async () => stores,
    cursorSecret: SECRET,
    concurrency: 2,
  });
  assert.equal((await live.search(searchSchema.parse({}))).products.length, 6);
  assert.equal(peak, 2);
});

test("lookup keeps the asked order, skips missing products, and reports unreachable stores", async () => {
  const stores = [store(1, 3), store(2, 3), store(3, 3)];
  stores[2].fail = true;
  const live = service(stores);
  const id = (fake: FakeStore, externalId: string) => `shopify:${fake.merchant.id}:${externalId}`;
  const result = await live.get([
    id(stores[1], "201"),
    id(stores[0], "100").toUpperCase(),
    id(stores[0], "999"),
    id(stores[2], "300"),
    "not-an-id",
  ]);
  assert.deepEqual(names(result), ["201", "100"]);
  assert.deepEqual(result.unavailable, [{ merchantId: stores[2].merchant.id, name: "Store 3" }]);

  stores[0].fail = stores[1].fail = true;
  await assert.rejects(live.get([id(stores[0], "100")]), AllStoresUnavailable);
});
