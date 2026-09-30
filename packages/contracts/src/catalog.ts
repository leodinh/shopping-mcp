import { z } from "zod";

/**
 * Catalog search, in real types: agents and the catalog share this exact schema. `maxPrice` is
 * in major units (19.99 = $19.99). HTTP query strings are converted by the REST adapter.
 */
export const searchSchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    merchantId: z.uuid().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional()
      .describe(
        "ISO 4217 code such as USD. Omit to search every currency; required with maxPrice.",
      ),
    maxPrice: z
      .number()
      .nonnegative()
      .optional()
      .describe("Highest price in major units of `currency` (19.99 = 19.99 USD)."),
    inStock: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(24),
    offset: z.number().int().min(0).max(100000).default(0),
  })
  // "Under 100" means nothing across USD, JPY, and EUR.
  .refine((query) => query.maxPrice === undefined || query.currency !== undefined, {
    message: "Set currency when using maxPrice",
    path: ["currency"],
  });

export type SearchInput = z.input<typeof searchSchema>;

export const productIdsSchema = z
  .array(z.uuid())
  .min(2)
  .max(5)
  .refine(
    (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
    "Product IDs must be unique",
  );

/** Search API DTO: product fields plus nested merchant. Not the Product row. */
export type CatalogProduct = {
  id: string;
  externalId: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  images: string[];
  inventory: number;
  productUrl: string;
  updatedAt: string;
  merchant: { id: string; name: string; slug: string };
};
