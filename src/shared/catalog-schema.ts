import { z } from "zod";

export const searchSchema = z.object({
  q: z.string().trim().max(200).default(""),
  merchantId: z.uuid().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  maxPrice: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/).optional(),
  inStock: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export function minorUnits(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Search API DTO: product fields plus nested merchant. Not the Product row. */
export type CatalogProduct = {
  id: string; externalId: string; name: string; description: string;
  priceMinor: number; currency: string; images: string[]; inventory: number;
  productUrl: string; updatedAt: string;
  merchant: { id: string; name: string; slug: string };
};
