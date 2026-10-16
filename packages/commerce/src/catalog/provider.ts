import { z } from "zod";
import type { CatalogProduct } from "@shopping-mcp/contracts";

const httpUrl = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
const priceSchema = z.object({
  amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

/**
 * A product normalized from a provider's response. Provider data is untrusted: every product is
 * parsed with this schema before it leaves the provider.
 */
export const externalProductSchema = z.object({
  provider: z.literal("shopify"),
  externalId: z.string().regex(/^\d{1,20}$/),
  name: z.string().trim().min(1).max(500),
  description: z.string().max(20000),
  price: priceSchema,
  available: z.boolean(),
  brand: z.string().max(255).nullable(),
  gtin: z.string().max(64).nullable(),
  sku: z.string().max(255).nullable(),
  images: z.array(httpUrl).max(20),
  productUrl: httpUrl,
  variants: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        title: z.string().max(500),
        price: priceSchema,
        available: z.boolean(),
      }),
    )
    .max(20),
});

export type ExternalProduct = Omit<CatalogProduct, "id" | "merchant"> &
  z.infer<typeof externalProductSchema>;

/** One provider-side search: the provider translates what it can into its own query. */
export type ProviderSearchQuery = {
  q: string;
  /** Buyer's market (ISO 3166); prices come back in that market's currency. */
  country?: string;
  /** Ceiling in minor units of `currency`. */
  maxPriceMinor?: number;
  currency?: string;
  inStock: boolean;
  first: number;
  /** The provider's own position, from a previous item's `cursor`. */
  after?: string;
};

/**
 * Each item carries the provider position right after it, so a caller that returns only some of a
 * page can resume exactly after the last one it used.
 */
export type ProviderPage = {
  items: Array<{ product: ExternalProduct; cursor: string }>;
  /**
   * The position after the whole page, including products the provider filtered out. Resume from
   * here once every item has been used, so filtered-out products aren't fetched again.
   */
  end: string | null;
  hasMore: boolean;
};

export type ProviderMerchant = { id: string; name: string; slug: string };

/** One connected store's live catalog. Credentials stay inside; callers see normalized products. */
export interface ProductProvider {
  readonly merchant: ProviderMerchant;
  search(query: ProviderSearchQuery, signal: AbortSignal): Promise<ProviderPage>;
  /** The products that still exist and are searchable; missing IDs are simply absent. */
  get(
    externalIds: string[],
    options: { country?: string },
    signal: AbortSignal,
  ): Promise<ExternalProduct[]>;
}
