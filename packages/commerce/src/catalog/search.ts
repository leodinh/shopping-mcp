import {
  betterAuthSecret,
  searchCacheFreshMs,
  searchCacheMaxAgeMs,
  searchPodConcurrency,
  searchStoreConcurrency,
  searchStoreTimeoutMs,
} from "@shopping-mcp/config";
import {
  formatProductId,
  parseProductId,
  type CatalogProduct,
  type SearchQuery,
  type SearchResult,
  type StoreOutcome,
  type UnavailableStore,
} from "@shopping-mcp/contracts";
import { Limiter } from "./cache/limiter";
import { PageFetcher } from "./cache/page-fetcher";
import { maxMinorUnits } from "./money";
import {
  cursorKey,
  decodeCursor,
  encodeCursor,
  type SearchCursor,
  type StorePosition,
} from "./cursor";
import type { ExternalProduct, ProductProvider, ProviderSearchQuery } from "./provider";

export { InvalidCursor } from "./cursor";

/** Every store tried failed, so there is no honest partial answer to give. */
export class AllStoresUnavailable extends Error {}

export type LookupResult = { products: CatalogProduct[]; unavailable: UnavailableStore[] };

/** Search and lookup over live stores (search pages may be served from a short-lived cache). */
export interface ProductSearchService {
  search(query: SearchQuery): Promise<SearchResult>;
  /** Products by ID, in the order asked; IDs that no longer exist are absent. */
  get(ids: string[], options?: { country?: string }): Promise<LookupResult>;
}

export type LiveSearchOptions = {
  /** Every store a search may reach, in a stable order (the round-robin order). */
  providers: (filter: { merchantIds?: string[] }) => Promise<ProductProvider[]>;
  timeoutMs?: number;
  /** Stores queried at once. */
  concurrency?: number;
  /** How store pages are fetched: cache, cross-pod locks, per-pod limits. Default: live only. */
  pages?: PageFetcher;
  cursorSecret?: string;
  now?: () => number;
};

/** Live fetching within this pod's configured limits, no cache. */
export function livePages() {
  return new PageFetcher({
    limiter: new Limiter(searchStoreConcurrency(), searchPodConcurrency()),
    freshMs: searchCacheFreshMs(),
    maxAgeMs: searchCacheMaxAgeMs(),
  });
}

type Outcome = StoreOutcome["outcome"];
// When a store is fetched more than once on a page, report the worst of what happened.
const SEVERITY: Outcome[] = [
  "cache_hit",
  "cache_miss",
  "stale_fallback",
  "provider_error",
  "provider_timeout",
];

// Refill fetches per store per page: bounds the work when filters reject most of a store's results.
const MAX_FETCHES_PER_STORE = 5;

/** A store during one page: its consumed position, and fetched products not yet returned. */
type StoreRun = {
  provider: ProductProvider;
  position: StorePosition;
  buffer: Array<{ product: ExternalProduct; cursor: string }>;
  /** Provider position after the page the buffer came from (skips what the provider filtered). */
  pageEnd: string | null;
  providerHasMore: boolean;
  /** When the store served the page in the buffer. */
  bufferFetchedAt: number;
  fetches: number;
  failed: boolean;
  attempted: boolean;
  outcome?: Outcome;
  /** Oldest data used from this store on this page. */
  fetchedAt?: number;
};

const toCatalogProduct = (
  product: ExternalProduct,
  provider: ProductProvider,
  fetchedAt: number,
): CatalogProduct => ({
  ...product,
  id: formatProductId({
    provider: product.provider,
    merchantId: provider.merchant.id,
    externalId: product.externalId,
  }),
  merchant: provider.merchant,
  fetchedAt: new Date(fetchedAt).toISOString(),
});

/** Runs `tasks` with at most `limit` in flight. */
async function bounded(tasks: Array<() => Promise<void>>, limit: number) {
  const queue = [...tasks];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let task = queue.shift(); task; task = queue.shift()) await task();
    }),
  );
}

/**
 * Adaptive live federated search: every eligible store is asked in parallel, results are merged
 * round-robin so each merchant gets balanced exposure, and stores with results left are asked
 * again until the page is full. Paging is a signed, stateless cursor of per-store positions.
 */
export class LiveProductSearchService implements ProductSearchService {
  private readonly key: Buffer;
  private readonly timeoutMs: number;
  private readonly concurrency: number;
  private readonly now: () => number;
  private readonly pages: PageFetcher;

  constructor(private readonly options: LiveSearchOptions) {
    this.key = cursorKey(options.cursorSecret ?? betterAuthSecret());
    this.timeoutMs = options.timeoutMs ?? searchStoreTimeoutMs();
    this.concurrency = options.concurrency ?? 8;
    this.now = options.now ?? Date.now;
    this.pages = options.pages ?? livePages();
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const eligible = await this.options.providers(
      query.merchantId ? { merchantIds: [query.merchantId] } : {},
    );
    const byMerchant = new Map(eligible.map((provider) => [provider.merchant.id, provider]));

    // Resume a session (dropping stores no longer eligible) or start one over every store.
    let session: SearchCursor;
    if (query.cursor) {
      const resumed = decodeCursor(query.cursor, query, this.key, this.now());
      const kept = resumed.stores.filter((store) => byMerchant.has(store.merchantId));
      const nextId = resumed.stores[resumed.next % Math.max(1, resumed.stores.length)]?.merchantId;
      const next = Math.max(
        0,
        kept.findIndex((store) => store.merchantId === nextId),
      );
      session = { stores: kept, next };
    } else {
      session = {
        stores: eligible.map((provider) => ({
          merchantId: provider.merchant.id,
          after: null,
          done: false,
        })),
        next: 0,
      };
    }

    const runs: StoreRun[] = session.stores.map((position) => ({
      provider: byMerchant.get(position.merchantId)!,
      position: { ...position },
      buffer: [],
      pageEnd: null,
      providerHasMore: !position.done,
      bufferFetchedAt: 0,
      fetches: 0,
      failed: false,
      attempted: false,
    }));
    const providerQuery = this.providerQuery(query);
    const products: CatalogProduct[] = [];
    let turn = runs.length ? session.next % runs.length : 0;

    // Stores that can still give results this page.
    const live = (run: StoreRun) =>
      !run.failed &&
      (run.buffer.length > 0 || (run.providerHasMore && run.fetches < MAX_FETCHES_PER_STORE));

    while (products.length < query.limit && runs.some(live)) {
      // Fill every live store whose buffer is empty, all at once.
      const empty = runs.filter((run) => live(run) && run.buffer.length === 0);
      if (empty.length) {
        const liveCount = runs.filter(live).length;
        const first = Math.max(1, Math.ceil((query.limit - products.length) / liveCount));
        await bounded(
          empty.map((run) => () => this.fetch(run, providerQuery, first)),
          this.concurrency,
        );
        continue;
      }
      // Strict round-robin: one product per store per turn. A store whose buffer runs dry stops
      // the pass, so it is refilled before anyone after it takes another turn.
      for (let visited = 0; visited < runs.length && products.length < query.limit; visited++) {
        const run = runs[turn];
        if (!live(run)) {
          turn = (turn + 1) % runs.length;
          continue;
        }
        if (run.buffer.length === 0) break;
        const item = run.buffer.shift()!;
        products.push(toCatalogProduct(item.product, run.provider, run.bufferFetchedAt));
        // Advance only past what was returned; the rest of the buffer is fetched again next page.
        run.position.after = run.buffer.length === 0 && run.pageEnd ? run.pageEnd : item.cursor;
        turn = (turn + 1) % runs.length;
      }
    }

    for (const run of runs) {
      // Exhausted only when the store said so and every fetched product was returned. A failed
      // store keeps its position and is retried on the next page.
      run.position.done = !run.failed && !run.providerHasMore && run.buffer.length === 0;
    }
    const attempted = runs.filter((run) => run.attempted);
    if (attempted.length > 0 && attempted.every((run) => run.failed)) {
      throw new AllStoresUnavailable("No store could be searched right now");
    }
    const unavailable = runs
      .filter((run) => run.failed)
      .map((run) => ({ merchantId: run.provider.merchant.id, name: run.provider.merchant.name }));
    const hasMore = runs.some((run) => !run.position.done);
    return {
      products,
      nextCursor: hasMore
        ? encodeCursor(
            { stores: runs.map((run) => run.position), next: turn },
            query,
            this.key,
            this.now(),
          )
        : null,
      hasMore,
      // Missing results only: stale data is reported per store, not as partial.
      partial: unavailable.length > 0,
      unavailable,
      stores: runs
        .filter((run) => run.outcome)
        .map((run) => ({
          merchantId: run.provider.merchant.id,
          name: run.provider.merchant.name,
          outcome: run.outcome!,
          fetchedAt: run.fetchedAt ? new Date(run.fetchedAt).toISOString() : null,
        })),
    };
  }

  async get(ids: string[], options: { country?: string } = {}): Promise<LookupResult> {
    // Normalized through the parser, so an upper-case UUID finds the same product.
    const parsed = ids.map((id) => {
      const parts = parseProductId(id);
      return { key: parts ? formatProductId(parts) : null, parts };
    });
    const merchantIds = [
      ...new Set(parsed.flatMap(({ parts }) => (parts ? [parts.merchantId] : []))),
    ];
    if (!merchantIds.length) return { products: [], unavailable: [] };
    const providers = await this.options.providers({ merchantIds });
    const found = new Map<string, CatalogProduct>();
    const unavailable: UnavailableStore[] = [];
    await bounded(
      providers.map((provider) => async () => {
        const wanted = parsed.flatMap(({ parts }) =>
          parts?.merchantId === provider.merchant.id ? [parts.externalId] : [],
        );
        try {
          // Always live: lookups back prices that are acted on (compare, checkout).
          const deadline = Date.now() + this.timeoutMs;
          const products = await this.pages.limiter.run(provider.merchant.id, deadline, () =>
            provider.get(wanted, options, AbortSignal.timeout(this.timeoutMs)),
          );
          const fetchedAt = Date.now();
          for (const product of products) {
            const catalog = toCatalogProduct(product, provider, fetchedAt);
            found.set(catalog.id, catalog);
          }
        } catch (error) {
          console.error(`Product lookup failed for ${provider.merchant.name}`, error);
          unavailable.push({ merchantId: provider.merchant.id, name: provider.merchant.name });
        }
      }),
      this.concurrency,
    );
    if (unavailable.length && unavailable.length === providers.length) {
      throw new AllStoresUnavailable("No store could be reached right now");
    }
    return {
      products: parsed.flatMap(({ key }) => {
        const product = key ? found.get(key) : undefined;
        return product ? [product] : [];
      }),
      unavailable,
    };
  }

  private providerQuery(query: SearchQuery): Omit<ProviderSearchQuery, "first" | "after"> {
    return {
      q: query.q,
      country: query.country,
      currency: query.currency,
      maxPriceMinor:
        query.maxPrice !== undefined && query.currency
          ? maxMinorUnits(query.maxPrice, query.currency)
          : undefined,
      inStock: query.inStock,
    };
  }

  private async fetch(
    run: StoreRun,
    query: Omit<ProviderSearchQuery, "first" | "after">,
    first: number,
  ) {
    run.attempted = true;
    run.fetches += 1;
    // Fetching only happens with an empty buffer, so the consumed position is where to resume.
    const after = run.position.after;
    const result = await this.pages.fetch(
      run.provider,
      { ...query, first, ...(after ? { after } : {}) },
      Date.now() + this.timeoutMs,
    );
    if (!run.outcome || SEVERITY.indexOf(result.outcome) > SEVERITY.indexOf(run.outcome)) {
      run.outcome = result.outcome;
    }
    if (!result.page) {
      run.failed = true;
      run.buffer = [];
      return;
    }
    const page = result.page;
    run.buffer = page.items;
    run.pageEnd = page.end;
    run.providerHasMore = page.hasMore;
    run.bufferFetchedAt = result.fetchedAt!;
    run.fetchedAt = Math.min(run.fetchedAt ?? Infinity, result.fetchedAt!);
    // A page with nothing usable still moves the position past what the provider skipped.
    if (!page.items.length && page.end) run.position.after = page.end;
  }
}
