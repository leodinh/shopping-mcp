import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Limiter } from "../../src/catalog/cache/limiter";
import { CacheUnavailable } from "../../src/catalog/cache/page-cache";
import { PageFetcher } from "../../src/catalog/cache/page-fetcher";
import { RedisPageCache } from "../../src/catalog/cache/redis-page-cache";
import type {
  ProductProvider,
  ProviderPage,
  ProviderSearchQuery,
} from "../../src/catalog/provider";

const url = process.env.REDIS_URL;
// Required in CI: a missing Redis must fail the build, not silently skip these tests.
if (!url && process.env.CI)
  throw new Error("REDIS_URL is required for Redis integration tests in CI");
const skip = url ? false : "REDIS_URL not set (docker compose up -d redis)";

const caches: RedisPageCache[] = [];
after(() => Promise.all(caches.map((cache) => cache.close())));

/** One "pod": its own Redis connection and in-process state, sharing Redis with the others. */
async function pod() {
  const cache = RedisPageCache.connect(url!, { commandTimeoutMs: 500 });
  caches.push(cache);
  for (let i = 0; i < 50 && !(await ready(cache)); i++) await sleep(20);
  return {
    cache,
    pages: new PageFetcher({
      cache,
      limiter: new Limiter(4, 32),
      freshMs: 5 * 60_000,
      maxAgeMs: 30 * 60_000,
      pollMs: 20,
    }),
  };
}
const ready = (cache: RedisPageCache) =>
  cache.read("probe").then(
    () => true,
    () => false,
  );
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const page = (label: string): ProviderPage => ({
  items: [{ product: { externalId: label } as never, cursor: `${label}-1` }],
  end: `${label}-1`,
  hasMore: false,
});

/** A store answering after `delayMs`; a unique cache scope keeps tests apart in shared Redis. */
function store(delayMs = 0) {
  const provider = {
    merchant: { id: "m1", name: "Store 1", slug: "s1" },
    cacheScope: `test:${randomUUID()}`,
    calls: 0,
    async search() {
      provider.calls += 1;
      await sleep(delayMs);
      return page(`call${provider.calls}`);
    },
    async get() {
      return [];
    },
  };
  return provider satisfies ProductProvider;
}

const query: ProviderSearchQuery = { q: "mug", inStock: false, first: 2 };
const inSeconds = (s: number) => Date.now() + s * 1000;

test("pods racing for the same page make one store call between them", { skip }, async () => {
  const pods = await Promise.all([pod(), pod(), pod()]);
  const shop = store(150);
  const results = await Promise.all(
    pods.flatMap(({ pages }) => [
      pages.fetch(shop, query, inSeconds(3)),
      pages.fetch(shop, query, inSeconds(3)),
    ]),
  );
  assert.equal(shop.calls, 1, "one fetch across three pods and six requests");
  assert.ok(results.every((result) => result.page?.end === "call1-1"));
  assert.deepEqual([...new Set(results.map((result) => result.outcome))].sort(), [
    "cache_hit",
    "cache_miss",
  ]);
});

test("a slow lock holder makes others wait for its page, never fetch beside it", async (t) => {
  if (skip) return t.skip(skip);
  const [a, b] = await Promise.all([pod(), pod()]);
  const shop = store(300);
  const holder = a.pages.fetch(shop, query, inSeconds(3));
  await sleep(50); // a holds the lock now
  const waiter = await b.pages.fetch(shop, query, inSeconds(3));
  assert.equal(waiter.outcome, "cache_hit");
  assert.equal((await holder).outcome, "cache_miss");
  assert.equal(shop.calls, 1);
});

test("a waiter whose deadline passes reports a timeout instead of fetching", async (t) => {
  if (skip) return t.skip(skip);
  const [a, b] = await Promise.all([pod(), pod()]);
  const shop = store(600);
  const holder = a.pages.fetch(shop, query, inSeconds(3));
  await sleep(50);
  const waiter = await b.pages.fetch(shop, query, Date.now() + 150);
  assert.equal(waiter.outcome, "provider_timeout");
  await holder;
  assert.equal(shop.calls, 1);
});

test("locks are owned: only the token holder can release or write", async (t) => {
  if (skip) return t.skip(skip);
  const { cache } = await pod();
  const key = `own-${randomUUID()}`;
  assert.equal(await cache.acquire(key, "mine", 5000), true);
  assert.equal(await cache.acquire(key, "theirs", 5000), false);
  await cache.release(key, "theirs");
  assert.equal((await cache.read(key)).locked, true, "someone else's release is ignored");
  assert.equal(
    await cache.commit(key, "theirs", { page: page("x"), fetchedAt: Date.now() }, 60_000),
    false,
  );
  assert.equal((await cache.read(key)).entry, null);
  await cache.release(key, "mine");
  assert.equal((await cache.read(key)).locked, false);
});

test("an expired lock frees the page, and the late holder can't overwrite newer data", async (t) => {
  if (skip) return t.skip(skip);
  const { cache } = await pod();
  const key = `expiry-${randomUUID()}`;
  assert.equal(await cache.acquire(key, "slow", 100), true);
  await sleep(150); // the slow holder's lock expires while it is still fetching
  assert.equal(
    await cache.acquire(key, "fast", 5000),
    true,
    "a crashed or slow holder doesn't block forever",
  );
  const newer = { page: page("newer"), fetchedAt: Date.now() };
  assert.equal(await cache.commit(key, "fast", newer, 60_000), true);
  const late = { page: page("older"), fetchedAt: newer.fetchedAt - 1000 };
  assert.equal(await cache.commit(key, "slow", late, 60_000), false);
  assert.equal((await cache.read(key)).entry?.page.end, "newer-1");

  // Even holding the lock, data older than what's stored is refused.
  assert.equal(await cache.acquire(key, "again", 5000), true);
  assert.equal(await cache.commit(key, "again", late, 60_000), false);
  assert.equal((await cache.read(key)).entry?.page.end, "newer-1");
  assert.equal((await cache.read(key)).locked, false, "a refused write still releases the lock");
});

test("cached pages expire at the total age limit", async (t) => {
  if (skip) return t.skip(skip);
  const { cache } = await pod();
  const key = `ttl-${randomUUID()}`;
  await cache.acquire(key, "t", 5000);
  await cache.commit(key, "t", { page: page("x"), fetchedAt: Date.now() }, 150);
  assert.ok((await cache.read(key)).entry);
  await sleep(250);
  assert.equal((await cache.read(key)).entry, null);
});

test("with Redis unreachable, commands fail fast and searches go live", { skip }, async () => {
  const down = RedisPageCache.connect("redis://127.0.0.1:1", { commandTimeoutMs: 100 });
  caches.push(down);
  const started = Date.now();
  await assert.rejects(down.read("anything"), CacheUnavailable);
  assert.ok(Date.now() - started < 500, "no hanging on a down Redis");
  const shop = store();
  const pages = new PageFetcher({
    cache: down,
    limiter: new Limiter(4, 32),
    freshMs: 1,
    maxAgeMs: 2,
  });
  const result = await pages.fetch(shop, query, inSeconds(1));
  assert.equal(result.outcome, "cache_miss");
  assert.equal(shop.calls, 1);
});

test("closing while still connecting leaves no connection behind", { skip }, async () => {
  // A connection that finished after a destroy kept the process alive (tests never exited).
  const cache = RedisPageCache.connect(url!);
  await cache.close();
  await sleep(300);
  assert.equal(cache.ready, false);
  await assert.rejects(cache.read("anything"), CacheUnavailable);
});
