import { z, ZodError } from "zod";
import { searchProducts } from "@/server/catalog/repository";

/** Agent-facing search options. Numbers and booleans, not query-string strings. */
export const searchProductsInput = z.object({
  q: z.string().trim().max(200).default(""),
  merchantId: z.uuid().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
  maxPrice: z.number().nonnegative().optional(),
  inStock: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(24),
  offset: z.number().int().min(0).max(100000).default(0),
});

export type SearchProductsInput = z.infer<typeof searchProductsInput>;

export function toCatalogSearch(input: SearchProductsInput) {
  return {
    q: input.q,
    merchantId: input.merchantId,
    currency: input.currency,
    maxPrice: input.maxPrice === undefined ? undefined : String(input.maxPrice),
    inStock: input.inStock ? "true" : "false",
    limit: input.limit,
    offset: input.offset,
  };
}

export const searchProductsTool = {
  title: "Search Products",
  description:
    "Search active products across connected merchants. Returns prices, availability, and merchant details.",
  inputSchema: searchProductsInput,
};

function textResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true as const } : {}) };
}

export async function runSearchProductsTool(input: SearchProductsInput) {
  try {
    return textResult(JSON.stringify(await searchProducts(toCatalogSearch(input))));
  } catch (error) {
    if (error instanceof ZodError) {
      return textResult(JSON.stringify({ error: "Invalid search parameters", issues: error.issues }), true);
    }
    return textResult("Catalog unavailable. Check database setup.", true);
  }
}

