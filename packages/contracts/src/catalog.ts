import { z } from "zod";

/**
 * A product's ID: `<provider>:<merchantId>:<externalId>`. Deterministic and readable, so a tool can
 * fetch the product live from its store without anything stored on our side.
 */
export const productIdSchema = z
  .string()
  .regex(
    /^shopify:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\d{1,20}$/i,
    "Not a product ID",
  );

export type ProductId = { provider: "shopify"; merchantId: string; externalId: string };

export function formatProductId({ provider, merchantId, externalId }: ProductId) {
  return `${provider}:${merchantId.toLowerCase()}:${externalId}`;
}

/** The parts of a product ID, or null when it isn't one. */
export function parseProductId(id: string): ProductId | null {
  if (!productIdSchema.safeParse(id).success) return null;
  const [, merchantId, externalId] = id.split(":");
  // The pattern only admits shopify (in any case); normalize so IDs compare equal.
  return { provider: "shopify", merchantId: merchantId.toLowerCase(), externalId };
}

/**
 * Catalog search, in real types: agents and the catalog share this exact schema. `maxPrice` is
 * in major units (19.99 = $19.99). HTTP query strings are converted by the REST adapter. To get
 * the next page, send the same parameters plus the previous response's `nextCursor`.
 */
export const searchSchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    merchantId: z.uuid().optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional()
      .describe("ISO 3166 country of the buyer, e.g. US. Prices are then that market's prices."),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional()
      .describe(
        "ISO 4217 code such as USD. Only products priced in it are returned; required with maxPrice.",
      ),
    maxPrice: z
      .number()
      .nonnegative()
      .optional()
      .describe("Highest price in major units of `currency` (19.99 = 19.99 USD)."),
    inStock: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(24),
    // ponytail: the stateless cursor grows with the number of stores (~150 bytes each), so this
    // ceiling is a few hundred stores; compress it or move to the Phase 6 index if that's reached.
    cursor: z
      .string()
      .max(60000)
      .optional()
      .describe("`nextCursor` from the previous page; send the same other parameters."),
  })
  // "Under 100" means nothing across USD, JPY, and EUR.
  .refine((query) => query.maxPrice === undefined || query.currency !== undefined, {
    message: "Set currency when using maxPrice",
    path: ["currency"],
  });

export type SearchInput = z.input<typeof searchSchema>;
export type SearchQuery = z.output<typeof searchSchema>;

export const productIdsSchema = z
  .array(productIdSchema)
  .min(2)
  .max(5)
  .refine(
    (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
    "Product IDs must be unique",
  );

/** An amount in the currency's minor units (cents; yen have none; dinars have three). */
export const priceSchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type Price = z.infer<typeof priceSchema>;

/** Search API DTO: a product as its store serves it right now, plus its merchant. */
export const catalogProductSchema = z.object({
  id: z.string(),
  provider: z.literal("shopify"),
  externalId: z.string(),
  name: z.string(),
  description: z.string(),
  /** The cheapest variant's price ("from"). */
  price: priceSchema,
  /** At least one variant can be bought. */
  available: z.boolean(),
  brand: z.string().nullable(),
  gtin: z.string().nullable(),
  sku: z.string().nullable(),
  images: z.array(z.string()),
  productUrl: z.string(),
  variants: z.array(
    z.object({ id: z.string(), title: z.string(), price: priceSchema, available: z.boolean() }),
  ),
  merchant: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  /** When the store served this data (ISO). Search results may be cached; lookups are live. */
  fetchedAt: z.string(),
});
export type CatalogProduct = z.infer<typeof catalogProductSchema>;

/**
 * How a store's results on this page were obtained:
 * `cache_hit` fresh from the cache; `cache_miss` fetched from the store now; `stale_fallback` the
 * store didn't answer, older cached results (see `fetchedAt`) were used; `provider_error` /
 * `provider_timeout` the store failed and its results are missing.
 */
export const storeOutcomeSchema = z.object({
  merchantId: z.string(),
  name: z.string(),
  outcome: z.enum([
    "cache_hit",
    "cache_miss",
    "stale_fallback",
    "provider_error",
    "provider_timeout",
  ]),
  /** When the store served the data used (ISO); null when it failed. */
  fetchedAt: z.string().nullable(),
});
export type StoreOutcome = z.infer<typeof storeOutcomeSchema>;

/** A store that didn't answer for this page; its products may be missing. */
export const unavailableStoreSchema = z.object({ merchantId: z.string(), name: z.string() });
export type UnavailableStore = z.infer<typeof unavailableStoreSchema>;

export const searchResultSchema = z.object({
  products: z.array(catalogProductSchema),
  /** Opaque; pass it back as `cursor` for the next page. Null on the last page. */
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  /** True only when some stores' results are missing (see `unavailable`); stale data isn't. */
  partial: z.boolean(),
  unavailable: z.array(unavailableStoreSchema),
  /** Per store searched on this page: how its results were obtained and how old they are. */
  stores: z.array(storeOutcomeSchema),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

/** `GET /api/products/:id`: one product, live from its store. */
export const productResponseSchema = z.object({ product: catalogProductSchema });

// The search parameters a results page carries in its URL: the HTTP API's own names, minus the
// cursor (large, short-lived) and the page size.
const BROWSE_KEYS = ["q", "merchantId", "country", "currency", "maxPrice", "inStock"] as const;

export type BrowseKey = (typeof BROWSE_KEYS)[number];
export const browseKeys: readonly BrowseKey[] = BROWSE_KEYS;

/**
 * A search as URL parameters, defaults left out: the results page's URL and its API calls. Takes
 * real types (the API's search) or the URL's own strings (the web page), with the same result.
 */
export function searchParams(query: Partial<Record<BrowseKey, string | number | boolean>>) {
  const params = new URLSearchParams();
  for (const key of BROWSE_KEYS) {
    const value = query[key];
    if (value === undefined || value === "" || value === false || value === "false") continue;
    params.set(key, String(value));
  }
  return params;
}

/** Where a shopper can see a search's results or a product, on the web origin. */
export const browseUrl = (webOrigin: string, query: Parameters<typeof searchParams>[0]) => {
  const params = searchParams(query).toString();
  return `${webOrigin}/products${params ? `?${params}` : ""}`;
};
export const productPageUrl = (webOrigin: string, id: string) =>
  `${webOrigin}/products/${encodeURIComponent(id)}`;
