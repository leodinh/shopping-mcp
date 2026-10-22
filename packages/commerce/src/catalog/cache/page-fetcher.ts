import { createHash, randomUUID } from "node:crypto";
import type { StoreOutcome } from "@shopping-mcp/contracts";
import type { ProductProvider, ProviderPage, ProviderSearchQuery } from "../provider";
import { CacheUnavailable, type CachedPage, type PageCache } from "./page-cache";
import type { Limiter } from "./limiter";

/** What happened for one store page; `page` is present unless the store failed. */
export type PageResult = {
  outcome: StoreOutcome["outcome"];
  page?: ProviderPage;
  fetchedAt?: number;
};

export type PageFetcherOptions = {
  /** Absent: no cache, every page is fetched live (still within the limits). */
  cache?: PageCache;
  limiter: Limiter;
  freshMs: number;
  /** Oldest a page may be, since it was fetched, to be served as a stale fallback. */
  maxAgeMs: number;
  /** How often a waiting pod rechecks the cache while another pod holds the lock. */
  pollMs?: number;
  /** Clock for page ages (fetchedAt); deadlines always use real time. */
  now?: () => number;
};

const isTimeout = (error: unknown) =>
  error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches one store's search page through the shared cache:
 * fresh hit → else join an identical fetch in this pod → else take the page's lock and fetch.
 * A pod that doesn't get the lock waits for the holder within its deadline, never fetching
 * without the lock: then it serves fresh data, an eligible stale page, or reports a timeout.
 * Any cache failure falls back to a live fetch that doesn't write.
 */
export class PageFetcher {
  private readonly inflight = new Map<string, Promise<PageResult>>();
  private readonly pollMs: number;
  private readonly now: () => number;

  constructor(private readonly options: PageFetcherOptions) {
    this.pollMs = options.pollMs ?? 100;
    this.now = options.now ?? Date.now;
  }

  get limiter() {
    return this.options.limiter;
  }

  fetch(provider: ProductProvider, query: ProviderSearchQuery, deadline: number) {
    const { cache } = this.options;
    if (!cache || !provider.cacheScope) return this.live(provider, query, deadline, null);
    const key = cacheKey(provider.cacheScope, query);
    const joined = this.inflight.get(key);
    if (joined) return joined;
    const fetching = this.cached(cache, key, provider, query, deadline).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, fetching);
    return fetching;
  }

  private async cached(
    cache: PageCache,
    key: string,
    provider: ProductProvider,
    query: ProviderSearchQuery,
    deadline: number,
  ): Promise<PageResult> {
    let entry: CachedPage | null;
    try {
      entry = (await cache.read(key)).entry;
    } catch (error) {
      if (!(error instanceof CacheUnavailable)) throw error;
      return this.live(provider, query, deadline, null);
    }
    if (entry && this.fresh(entry)) return hit("cache_hit", entry);
    let stale = entry && this.servable(entry) ? entry : null;
    const token = randomUUID();

    for (;;) {
      let acquired: boolean;
      try {
        // The lock outlives the holder's deadline a little, so it can't expire mid-fetch.
        acquired = await cache.acquire(key, token, Math.max(1, deadline - Date.now()) + 1000);
      } catch (error) {
        if (!(error instanceof CacheUnavailable)) throw error;
        // Ambiguous (maybe we hold it): fetch, but never write; the lock expires on its own.
        return this.live(provider, query, deadline, stale);
      }
      if (acquired) return this.fetchAndStore(cache, key, token, provider, query, deadline, stale);

      // Someone else is fetching this page: wait for it within our deadline.
      for (;;) {
        const left = deadline - Date.now();
        if (left <= 0)
          return stale ? hit("stale_fallback", stale) : { outcome: "provider_timeout" };
        await sleep(Math.min(this.pollMs, left));
        let state: { entry: CachedPage | null; locked: boolean };
        try {
          state = await cache.read(key);
        } catch (error) {
          if (!(error instanceof CacheUnavailable)) throw error;
          return stale ? hit("stale_fallback", stale) : this.live(provider, query, deadline, null);
        }
        if (state.entry && this.fresh(state.entry)) return hit("cache_hit", state.entry);
        if (state.entry && this.servable(state.entry)) stale = state.entry;
        if (!state.locked) break; // holder gave up without fresh data: try to take the lock
      }
    }
  }

  private async fetchAndStore(
    cache: PageCache,
    key: string,
    token: string,
    provider: ProductProvider,
    query: ProviderSearchQuery,
    deadline: number,
    stale: CachedPage | null,
  ): Promise<PageResult> {
    const result = await this.live(provider, query, deadline, stale);
    try {
      if (result.outcome === "cache_miss") {
        const entry = { page: result.page!, fetchedAt: result.fetchedAt! };
        // Kept until it's too old even for a stale fallback.
        await cache.commit(key, token, entry, this.options.maxAgeMs);
      } else {
        await cache.release(key, token);
      }
    } catch (error) {
      if (!(error instanceof CacheUnavailable)) throw error;
      // The lock expires on its own; the page itself is still good for this request.
    }
    return result;
  }

  /** Asks the store itself, within this pod's limits and the deadline. */
  private async live(
    provider: ProductProvider,
    query: ProviderSearchQuery,
    deadline: number,
    stale: CachedPage | null,
  ): Promise<PageResult> {
    try {
      const page = await this.options.limiter.run(provider.merchant.id, deadline, () =>
        provider.search(query, AbortSignal.timeout(Math.max(1, deadline - Date.now()))),
      );
      return { outcome: "cache_miss", page, fetchedAt: this.now() };
    } catch (error) {
      console.error(`Search failed for ${provider.merchant.name}`, error);
      if (stale) return hit("stale_fallback", stale);
      return { outcome: isTimeout(error) ? "provider_timeout" : "provider_error" };
    }
  }

  private fresh(entry: CachedPage) {
    return this.now() - entry.fetchedAt <= this.options.freshMs;
  }

  /** Strict ceiling on total age since the provider answered. */
  private servable(entry: CachedPage) {
    return this.now() - entry.fetchedAt <= this.options.maxAgeMs;
  }
}

const hit = (outcome: "cache_hit" | "stale_fallback", entry: CachedPage): PageResult => ({
  outcome,
  page: entry.page,
  fetchedAt: entry.fetchedAt,
});

/**
 * One store page: the store's cache scope (its connection generation, so a reconnect never sees
 * the old connection's pages) plus everything that changes the answer, prices included.
 */
export function cacheKey(scope: string, query: ProviderSearchQuery) {
  const { q, country, currency, maxPriceMinor, inStock, first, after } = query;
  return createHash("sha256")
    .update(
      JSON.stringify([
        scope,
        q.trim(),
        country ?? null,
        currency ?? null,
        maxPriceMinor ?? null,
        inStock,
        first,
        after ?? null,
      ]),
    )
    .digest("base64url");
}
