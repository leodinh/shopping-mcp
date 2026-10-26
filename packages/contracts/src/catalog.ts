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
export type Price = { amountMinor: number; currency: string };

/** Search API DTO: a product as its store serves it right now, plus its merchant. */
export type CatalogProduct = {
  id: string;
  provider: "shopify";
  externalId: string;
  name: string;
  description: string;
  /** The cheapest variant's price ("from"). */
  price: Price;
  /** At least one variant can be bought. */
  available: boolean;
  brand: string | null;
  gtin: string | null;
  sku: string | null;
  images: string[];
  productUrl: string;
  variants: Array<{ id: string; title: string; price: Price; available: boolean }>;
  merchant: { id: string; name: string; slug: string };
  /** When the store served this data (ISO). Search results may be cached; lookups are live. */
  fetchedAt: string;
};

/**
 * How a store's results on this page were obtained:
 * `cache_hit` fresh from the cache; `cache_miss` fetched from the store now; `stale_fallback` the
 * store didn't answer, older cached results (see `fetchedAt`) were used; `provider_error` /
 * `provider_timeout` the store failed and its results are missing.
 */
export type StoreOutcome = {
  merchantId: string;
  name: string;
  outcome: "cache_hit" | "cache_miss" | "stale_fallback" | "provider_error" | "provider_timeout";
  /** When the store served the data used (ISO); null when it failed. */
  fetchedAt: string | null;
};

/** A store that didn't answer for this page; its products may be missing. */
export type UnavailableStore = { merchantId: string; name: string };

export type SearchResult = {
  products: CatalogProduct[];
  /** Opaque; pass it back as `cursor` for the next page. Null on the last page. */
  nextCursor: string | null;
  hasMore: boolean;
  /** True only when some stores' results are missing (see `unavailable`); stale data isn't. */
  partial: boolean;
  unavailable: UnavailableStore[];
  /** Per store searched on this page: how its results were obtained and how old they are. */
  stores: StoreOutcome[];
};
