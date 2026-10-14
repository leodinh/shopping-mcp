import {
  productIdSchema,
  productIdsSchema,
  searchSchema,
  type SearchInput,
} from "@shopping-mcp/contracts";
import { shopifyProviders } from "../connectors/shopify/provider";
import { LiveProductSearchService, type ProductSearchService } from "./search";

export { AllStoresUnavailable, InvalidCursor, type ProductSearchService } from "./search";

let service: ProductSearchService | undefined;

/** Live search over every connected store; built on first use so imports need no secrets. */
export function productSearch(): ProductSearchService {
  return (service ??= new LiveProductSearchService({
    providers: (filter) => shopifyProviders(filter),
  }));
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

export async function getCheckout(id: string, options: { country?: string } = {}) {
  const { product } = await getProduct(id, options);
  if (!product) return null;
  return {
    supported: false as const,
    productId: product.id,
    merchant: product.merchant,
    checkoutUrl: null,
    productUrl: product.productUrl,
    message:
      "Merchant checkout is not integrated yet. Use the product URL until a real checkout exists.",
  };
}
