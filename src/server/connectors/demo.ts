import { z } from "zod";
import { type MerchantConnector, validateSnapshot } from "./contract";

const configSchema = z.object({ storeSlug: z.string().regex(/^[a-z0-9-]+$/) });
const catalogSchema = z.object({
  complete: z.literal(true),
  products: z.array(z.object({
    sku: z.string(), title: z.string(), details: z.string(),
    price_cents: z.number(), currency_code: z.string(),
    image_urls: z.array(z.string()), stock: z.number(), url: z.string(),
  })).max(10000),
});

export const demoConnector: MerchantConnector = {
  type: "demo",
  async fetchCatalog(config) {
    const { storeSlug } = configSchema.parse(config);
    const base = process.env.DEMO_API_URL ?? "http://127.0.0.1:4001";
    const response = await fetch(new URL(`/stores/${storeSlug}/products`, base), {
      signal: AbortSignal.timeout(10000), cache: "no-store",
    });
    if (!response.ok) throw new Error(`Demo merchant returned HTTP ${response.status}`);
    const catalog = catalogSchema.parse(await response.json());
    return validateSnapshot(catalog.products.map((product) => ({
      externalId: product.sku, name: product.title, description: product.details,
      priceMinor: product.price_cents, currency: product.currency_code,
      images: product.image_urls, inventory: product.stock, productUrl: product.url,
    })));
  },
};
