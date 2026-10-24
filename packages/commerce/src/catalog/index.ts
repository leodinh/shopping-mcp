import {
  productIdSchema,
  type CatalogProduct,
  productIdsSchema,
  searchSchema,
  type SearchInput,
} from "@shopping-mcp/contracts";
import {
  redisUrl,
  searchCacheFreshMs,
  searchCacheMaxAgeMs,
  searchPodConcurrency,
  searchStoreConcurrency,
} from "@shopping-mcp/config";
import { shopifyProviders } from "../connectors/shopify/provider";
import { Limiter } from "./cache/limiter";
import { PageFetcher } from "./cache/page-fetcher";
import { RedisPageCache } from "./cache/redis-page-cache";
import { LiveProductSearchService, type ProductSearchService } from "./search";

export { AllStoresUnavailable, InvalidCursor, type ProductSearchService } from "./search";

let service: ProductSearchService | undefined;
let cache: RedisPageCache | undefined;

/**
 * Live search over every connected store, with store pages cached in Redis when `REDIS_URL` is
 * set (otherwise every page is fetched live). Built on first use so imports need no secrets.
 */
export function productSearch(): ProductSearchService {
  return (service ??= new LiveProductSearchService({
    providers: (filter) => shopifyProviders(filter),
    pages: new PageFetcher({
      cache: connectSearchCache(),
      limiter: new Limiter(searchStoreConcurrency(), searchPodConcurrency()),
      freshMs: searchCacheFreshMs(),
      maxAgeMs: searchCacheMaxAgeMs(),
    }),
  }));
}

/**
 * Opens the search cache's Redis connection once (call at startup, so the first search can already
 * use it) and returns it; undefined without `REDIS_URL`. Needs no other secrets.
 */
export function connectSearchCache() {
  if (!cache && redisUrl()) cache = RedisPageCache.connect(redisUrl()!);
  return cache;
}

/** Closes the search cache's Redis connection (app shutdown); the next search reconnects. */
export async function closeProductSearch() {
  const closing = cache;
  service = undefined;
  cache = undefined;
  await closing?.close();
}

export async function searchProducts(input: SearchInput) {
  const query = searchSchema.parse(input); // before productSearch(): fail fast, no secrets
  return productSearch().search(query);
}

/** One product, fetched live from its store; null when it no longer exists or isn't searchable. */
export async function getProduct(id: string, options: { country?: string } = {}) {
  const productId = productIdSchema.parse(id); // before productSearch(): fail fast, no secrets
  const { products, unavailable } = await productSearch().get([productId], options);
  return { product: products[0] ?? null, unavailable };
}

export async function compareProducts(ids: string[], options: { country?: string } = {}) {
  const productIds = productIdsSchema.parse(ids);
  const { products, unavailable } = await productSearch().get(productIds, options);
  const found = new Set(products.map((product) => product.id.toLowerCase()));
  return {
    products,
    missingIds: productIds.filter((id) => !found.has(id.toLowerCase())),
    unavailable,
  };
}

export type CheckoutResult =
  | {
      ok: true;
      checkout: {
        supported: false;
        productId: string;
        merchant: CatalogProduct["merchant"];
        checkoutUrl: null;
        productUrl: string;
        /** The offer as the store states it right now, never from a cache. */
        offer: { price: CatalogProduct["price"]; available: true; fetchedAt: string };
        message: string;
      };
    }
  | { ok: false; reason: "not_found" | "unavailable" | "store_unavailable" };

/**
 * Validates the current offer before pointing anyone at a purchase: the product is fetched live
 * (lookups are never cached) and must exist and be for sale. A store that doesn't answer gives no
 * offer, rather than a stale one.
 */
export async function getCheckout(
  id: string,
  options: { country?: string } = {},
  search: ProductSearchService = productSearch(),
): Promise<CheckoutResult> {
  const productId = productIdSchema.parse(id);
  const { products, unavailable } = await search.get([productId], options);
  if (unavailable.length) return { ok: false, reason: "store_unavailable" };
  const product = products[0];
  if (!product) return { ok: false, reason: "not_found" };
  if (!product.available) return { ok: false, reason: "unavailable" };
  return {
    ok: true,
    checkout: {
      supported: false,
      productId: product.id,
      merchant: product.merchant,
      checkoutUrl: null,
      productUrl: product.productUrl,
      offer: { price: product.price, available: true, fetchedAt: product.fetchedAt },
      message:
        "Merchant checkout is not integrated yet. Use the product URL until a real checkout exists.",
    },
  };
}
