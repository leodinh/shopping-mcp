import test from "node:test";
import assert from "node:assert/strict";
import { Limiter } from "../src/catalog/cache/limiter";
import { CacheUnavailable, type CachedPage, type PageCache } from "../src/catalog/cache/page-cache";
import { PageFetcher, cacheKey } from "../src/catalog/cache/page-fetcher";
import type { ProductProvider, ProviderPage, ProviderSearchQuery } from "../src/catalog/provider";

const MIN = 60_000;
const query: ProviderSearchQuery = { q: "mug", inStock: false, first: 2 };

/** In-memory `PageCache` with the same rules as the Redis scripts; can be told to fail. */
class MemoryCache implements PageCache {
  data = new Map<string, CachedPage>();
  /** When each stored entry expires (Redis PX); entries set directly by tests never expire. */
  expires = new Map<string, number>();
  locks = new Map<string, { token: string; until: number }>();
  failing = new Set<keyof PageCache>();

  private check(method: keyof PageCache) {
    if (this.failing.has(method)) throw new CacheUnavailable(`${method} failed`);
  }
  private holder(key: string) {
    const lock = this.locks.get(key);
    if (lock && lock.until <= Date.now()) this.locks.delete(key);
    return this.locks.get(key);
  }
  async read(key: string) {
    this.check("read");
    if ((this.expires.get(key) ?? Infinity) <= Date.now()) this.data.delete(key);
    return { entry: this.data.get(key) ?? null, locked: Boolean(this.holder(key)) };
  }
  async acquire(key: string, token: string, ttlMs: number) {
    this.check("acquire");
    if (this.holder(key)) return false;
    this.locks.set(key, { token, until: Date.now() + ttlMs });
    return true;
  }
  async commit(key: string, token: string, entry: CachedPage, ttlMs: number) {
    this.check("commit");
    if (this.holder(key)?.token !== token) return false;
    this.locks.delete(key);
    const current = this.data.get(key);
    if (current && current.fetchedAt >= entry.fetchedAt) return false;
    this.data.set(key, entry);
    this.expires.set(key, Date.now() + ttlMs);
    return true;
  }
  async release(key: string, token: string) {
    this.check("release");
    if (this.holder(key)?.token === token) this.locks.delete(key);
  }
}

const page = (label: string): ProviderPage => ({
  items: [{ product: { externalId: label } as never, cursor: `${label}-1` }],
  end: `${label}-1`,
  hasMore: false,
});

/** A store whose search answers `answer()` after `delayMs`, counting calls. */
function store(answer: () => ProviderPage | Error = () => page("live"), delayMs = 0, scope = "s1") {
  const provider = {
    merchant: { id: "m1", name: "Store 1", slug: "s1" },
    cacheScope: scope,
    calls: 0,
    async search(_query: ProviderSearchQuery, signal: AbortSignal) {
      provider.calls += 1;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)));
      });
      const result = answer();
      if (result instanceof Error) throw result;
      return result;
    },
    async get() {
      return [];
    },
  };
  return provider satisfies ProductProvider;
}

function fetcher(cache: PageCache | undefined, clock = { now: Date.now() }) {
  return new PageFetcher({
    cache,
    limiter: new Limiter(4, 32),
    freshMs: 5 * MIN,
    maxAgeMs: 30 * MIN,
    pollMs: 10,
    now: () => clock.now,
  });
}

const key = (scope = "s1") => cacheKey(scope, query);
const inSeconds = (s: number) => Date.now() + s * 1000;

test("a fresh cached page is served without asking the store", async () => {
  const cache = new MemoryCache();
  const clock = { now: Date.now() };
  cache.data.set(key(), { page: page("cached"), fetchedAt: clock.now - 4 * MIN });
  const shop = store();
  const result = await fetcher(cache, clock).fetch(shop, query, inSeconds(1));
  assert.equal(result.outcome, "cache_hit");
  assert.equal(result.page?.end, "cached-1");
  assert.equal(shop.calls, 0);
});

test("a miss fetches once, stores the page with its fetch time, and then hits", async () => {
  const cache = new MemoryCache();
  const pages = fetcher(cache);
  const shop = store();
  const first = await pages.fetch(shop, query, inSeconds(1));
  assert.equal(first.outcome, "cache_miss");
  assert.ok(first.fetchedAt);
  assert.equal(cache.data.get(key())?.fetchedAt, first.fetchedAt);
  assert.equal(cache.locks.size, 0, "lock released by the commit");
  assert.equal((await pages.fetch(shop, query, inSeconds(1))).outcome, "cache_hit");
  assert.equal(shop.calls, 1);
});

test("identical requests in one pod share a single store call", async () => {
  const shop = store(() => page("live"), 30);
  const pages = fetcher(new MemoryCache());
  const results = await Promise.all(
    Array.from({ length: 5 }, () => pages.fetch(shop, query, inSeconds(1))),
  );
  assert.equal(shop.calls, 1);
  assert.ok(results.every((result) => result.page?.end === "live-1"));
});

test("stale fallback is bounded by total age since the page was fetched", async () => {
  const clock = { now: Date.now() };
  const failing = () => store(() => new Error("Shopify is down"));
  for (const [age, expected] of [
    [5 * MIN + 1, "stale_fallback"],
    [30 * MIN, "stale_fallback"],
    [30 * MIN + 1, "provider_error"],
  ] as const) {
    const cache = new MemoryCache();
    cache.data.set(key(), { page: page("old"), fetchedAt: clock.now - age });
    const result = await fetcher(cache, clock).fetch(failing(), query, inSeconds(1));
    assert.equal(result.outcome, expected, `age ${age / MIN} min`);
    if (expected === "stale_fallback") assert.equal(result.fetchedAt, clock.now - age);
  }
});

test("a slow store times out at the deadline, falling back to an eligible stale page", async () => {
  const clock = { now: Date.now() };
  const slow = store(() => page("late"), 5000);
  const started = Date.now();
  const none = await fetcher(new MemoryCache(), clock).fetch(slow, query, Date.now() + 80);
  assert.equal(none.outcome, "provider_timeout");
  assert.ok(Date.now() - started < 1000, "bounded by the deadline");

  const cache = new MemoryCache();
  cache.data.set(key(), { page: page("old"), fetchedAt: clock.now - 10 * MIN });
  const stale = await fetcher(cache, clock).fetch(slow, query, Date.now() + 80);
  assert.equal(stale.outcome, "stale_fallback");
});

test("while another pod holds the lock, a pod waits and takes its fresh page; it never fetches", async () => {
  const cache = new MemoryCache();
  await cache.acquire(key(), "other-pod", 10_000);
  const shop = store();
  const waiting = fetcher(cache).fetch(shop, query, inSeconds(1));
  setTimeout(
    () =>
      void cache.commit(
        key(),
        "other-pod",
        { page: page("theirs"), fetchedAt: Date.now() },
        60_000,
      ),
    50,
  );
  const result = await waiting;
  assert.equal(result.outcome, "cache_hit");
  assert.equal(result.page?.end, "theirs-1");
  assert.equal(shop.calls, 0);
});

test("if the lock holder never finishes, the waiter stops at its deadline without fetching", async () => {
  const clock = { now: Date.now() };
  const cache = new MemoryCache();
  await cache.acquire(key(), "stuck-pod", 10_000);
  const shop = store();
  const nothing = await fetcher(cache, clock).fetch(shop, query, Date.now() + 60);
  assert.equal(nothing.outcome, "provider_timeout");
  cache.data.set(key(), { page: page("old"), fetchedAt: clock.now - 10 * MIN });
  const stale = await fetcher(cache, clock).fetch(shop, query, Date.now() + 60);
  assert.equal(stale.outcome, "stale_fallback");
  assert.equal(shop.calls, 0, "only the lock holder may ask the store");
});

test("when the holder gives up without data, a waiter takes the lock and fetches", async () => {
  const cache = new MemoryCache();
  await cache.acquire(key(), "failed-pod", 10_000);
  const shop = store();
  const waiting = fetcher(cache).fetch(shop, query, inSeconds(1));
  setTimeout(() => void cache.release(key(), "failed-pod"), 30);
  assert.equal((await waiting).outcome, "cache_miss");
  assert.equal(shop.calls, 1);
});

test("a holder whose lock expired cannot overwrite newer data", async () => {
  const cache = new MemoryCache();
  assert.equal(await cache.acquire(key(), "slow-pod", 1), true);
  await new Promise((resolve) => setTimeout(resolve, 5)); // its lock expires
  const newer = { page: page("newer"), fetchedAt: Date.now() };
  assert.equal(await cache.acquire(key(), "fast-pod", 10_000), true);
  assert.equal(await cache.commit(key(), "fast-pod", newer, 0), true);
  const late = { page: page("older"), fetchedAt: newer.fetchedAt - 1000 };
  assert.equal(await cache.commit(key(), "slow-pod", late, 0), false);
  assert.equal(cache.data.get(key())?.page.end, "newer-1");
});

test("cache failures at any step fall back to a live fetch that never writes", async () => {
  for (const failing of ["read", "acquire", "commit", "release"] as const) {
    const cache = new MemoryCache();
    cache.failing.add(failing);
    const shop = store(failing === "release" ? () => new Error("down") : () => page("live"));
    const result = await fetcher(cache).fetch(shop, query, inSeconds(1));
    if (failing === "release") assert.equal(result.outcome, "provider_error", failing);
    else assert.equal(result.outcome, "cache_miss", failing);
    if (failing !== "commit") assert.equal(cache.data.size, 0, `${failing}: nothing written`);
    assert.equal(shop.calls, 1, failing);
  }
});

test("a reconnected store (new cache scope) never sees the old connection's pages", async () => {
  const cache = new MemoryCache();
  cache.data.set(key("s1"), { page: page("old-connection"), fetchedAt: Date.now() });
  const result = await fetcher(cache).fetch(store(undefined, 0, "s2"), query, inSeconds(1));
  assert.equal(result.outcome, "cache_miss");
  assert.equal(result.page?.end, "live-1");
});

test("without a cache (or a cache scope) every page is fetched live", async () => {
  const shop = store();
  assert.equal((await fetcher(undefined).fetch(shop, query, inSeconds(1))).outcome, "cache_miss");
  assert.equal((await fetcher(undefined).fetch(shop, query, inSeconds(1))).outcome, "cache_miss");
  assert.equal(shop.calls, 2);
});

test("the pod limits calls per store and overall, and waiting counts against the deadline", async () => {
  const limiter = new Limiter(2, 3);
  let running = 0;
  let peak = 0;
  const task = async () => {
    peak = Math.max(peak, ++running);
    await new Promise((resolve) => setTimeout(resolve, 20));
    running--;
  };
  await Promise.all(Array.from({ length: 6 }, () => limiter.run("store", inSeconds(1), task)));
  assert.equal(peak, 2, "per store");
  peak = 0;
  await Promise.all(
    ["a", "b", "c", "d", "e"].map((store) => limiter.run(store, inSeconds(1), task)),
  );
  assert.equal(peak, 3, "overall");

  const busy = limiter.run("x", inSeconds(1), () => new Promise((r) => setTimeout(r, 200)));
  await limiter.run("x", inSeconds(1), async () => {});
  const second = limiter.run("x", inSeconds(1), () => new Promise((r) => setTimeout(r, 200)));
  await assert.rejects(
    limiter.run("x", Date.now() + 30, async () => {}),
    { name: "TimeoutError" },
  );
  await Promise.all([busy, second]);
});

test("a lock holder rechecks the cache first: fresh data that landed meanwhile is used, not refetched", async () => {
  // Another pod commits between our read (a miss) and our acquire.
  class Racing extends MemoryCache {
    override async acquire(key: string, token: string, ttlMs: number) {
      this.data.set(key, { page: page("theirs"), fetchedAt: Date.now() });
      return super.acquire(key, token, ttlMs);
    }
  }
  const cache = new Racing();
  const shop = store();
  const result = await fetcher(cache).fetch(shop, query, inSeconds(1));
  assert.equal(result.outcome, "cache_hit");
  assert.equal(result.page?.end, "theirs-1");
  assert.equal(shop.calls, 0);
  assert.equal(cache.locks.size, 0, "the lock is released");
});

test("Redis failing while waiting goes live, keeping stale data only as the fallback", async () => {
  const clock = { now: Date.now() };
  const cache = new MemoryCache();
  cache.data.set(key(), { page: page("old"), fetchedAt: clock.now - 10 * MIN });
  await cache.acquire(key(), "other-pod", 10_000);
  const shop = store();
  const waiting = fetcher(cache, clock).fetch(shop, query, inSeconds(1));
  setTimeout(() => cache.failing.add("read"), 30); // Redis drops while we poll
  const result = await waiting;
  assert.equal(result.outcome, "cache_miss", "live data beats stale when Redis is gone");
  assert.equal(shop.calls, 1);

  const failingStore = store(() => new Error("down"));
  const cache2 = new MemoryCache();
  cache2.data.set(key(), { page: page("old"), fetchedAt: clock.now - 10 * MIN });
  await cache2.acquire(key(), "other-pod", 10_000);
  const waiting2 = fetcher(cache2, clock).fetch(failingStore, query, inSeconds(1));
  setTimeout(() => cache2.failing.add("read"), 30);
  assert.equal((await waiting2).outcome, "stale_fallback", "stale only when the store fails too");
});
