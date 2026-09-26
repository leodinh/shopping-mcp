import { z } from "zod";

const httpUrl = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));

export const normalizedProductSchema = z.object({
  externalId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(500),
  description: z.string().max(20000),
  priceMinor: z.number().int().min(0).max(2147483647),
  currency: z.string().regex(/^[A-Z]{3}$/),
  images: z.array(httpUrl).max(20),
  inventory: z.number().int().min(0).max(2147483647),
  productUrl: httpUrl,
});

export type NormalizedProduct = z.infer<typeof normalizedProductSchema>;

export interface MerchantConnector {
  readonly type: string;
  fetchCatalog(config: unknown): Promise<NormalizedProduct[]>;
}

export function validateSnapshot(input: unknown): NormalizedProduct[] {
  const products = z.array(normalizedProductSchema).max(10000).parse(input);
  const identifiers = new Set<string>();
  for (const product of products) {
    if (identifiers.has(product.externalId)) throw new Error(`Duplicate external ID: ${product.externalId}`);
    identifiers.add(product.externalId);
  }
  return products;
}
