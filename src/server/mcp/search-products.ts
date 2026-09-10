import { z } from "zod";
import { searchProducts } from "@/server/catalog/repository";
import { catalogToolError, dataResult } from "./responses";

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
  description: "Find products using keywords, price, merchant, and availability.",
  inputSchema: searchProductsInput,
};

export async function runSearchProductsTool(input: SearchProductsInput) {
  try {
    return dataResult(await searchProducts(toCatalogSearch(input)));
  } catch (error) {
    return catalogToolError(error);
  }
}
