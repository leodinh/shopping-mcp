import { and, eq, isNotNull } from "drizzle-orm";
import { database, merchantConnections, merchants, type Database } from "@shopping-mcp/database";
import { majorAmount, minorUnits } from "../../catalog/money";
import {
  externalProductSchema,
  type ExternalProduct,
  type ProductProvider,
  type ProviderMerchant,
  type ProviderPage,
  type ProviderSearchQuery,
} from "../../catalog/provider";
import { shopifyAccessToken } from "./access";
import { SHOPIFY_API_VERSION } from "./token";

const MAX_VARIANTS = 20;
const MAX_IMAGES = 10;

const PRODUCT_FIELDS = `#graphql
  fragment ProductFields on Product {
    id
    title
    description
    handle
    status
    vendor
    onlineStoreUrl
    media(first: ${MAX_IMAGES}) { nodes { ... on MediaImage { image { url } } } }
    variants(first: ${MAX_VARIANTS}) {
      nodes {
        id
        title
        price
        availableForSale
        barcode
        sku
        contextualPricing(context: { country: $country }) @include(if: $hasCountry) {
          price { amount currencyCode }
        }
      }
    }
  }
`;

const SEARCH_QUERY = `#graphql
  query Search(
    $query: String!
    $first: Int!
    $after: String
    $sortKey: ProductSortKeys
    $country: CountryCode = US
    $hasCountry: Boolean!
  ) {
    shop { currencyCode }
    products(first: $first, after: $after, query: $query, sortKey: $sortKey) {
      edges { cursor node { ...ProductFields } }
      pageInfo { hasNextPage endCursor }
    }
  }
  ${PRODUCT_FIELDS}
`;

type ShopifyVariant = {
  id: string;
  title: string;
  price: string;
  availableForSale: boolean;
  barcode: string | null;
  sku: string | null;
  contextualPricing?: { price: { amount: string; currencyCode: string } } | null;
};

export type ShopifyProductNode = {
  id: string;
  title: string;
  description: string | null;
  handle: string;
  status: string;
  vendor: string | null;
  onlineStoreUrl: string | null;
  media: { nodes: Array<{ image?: { url: string } | null }> };
  variants: { nodes: ShopifyVariant[] };
};

const numericId = (gid: string) => gid.slice(gid.lastIndexOf("/") + 1);

/**
 * Free text as Shopify search terms that can only match text: each word is quoted, so `status:draft`
 * or `OR` in a shopper's query never becomes a filter or an operator.
 */
export function searchTerms(q: string) {
  return q
    .replace(/["\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 20)
    .map((word) => `"${word}"`)
    .join(" ");
}

/** Searchable means active and published to the online store; drafts never reach assistants. */
const SEARCHABLE = "status:active AND published_status:published";

export function shopifySearchQuery(query: ProviderSearchQuery) {
  const parts = [searchTerms(query.q), SEARCHABLE];
  // Shopify compares the shop's base price. With a buyer country the price shown is the market's,
  // so the provider checks the ceiling itself after fetching instead.
  if (query.maxPriceMinor !== undefined && query.currency && !query.country) {
    parts.push(`price:<=${majorAmount(query.maxPriceMinor, query.currency)}`);
  }
  return parts.filter(Boolean).join(" AND ");
}

/** Normalizes one Shopify product, or null when it isn't searchable or fails validation. */
export function mapShopifyProduct(
  node: ShopifyProductNode,
  shop: string,
  shopCurrency: string,
): ExternalProduct | null {
  if (node.status !== "ACTIVE") return null;
  try {
    return normalize(node, shop, shopCurrency);
  } catch (error) {
    // One malformed product (e.g. a price finer than its currency) must not fail the page.
    console.warn(`Skipping invalid Shopify product ${node.id} from ${shop}`, error);
    return null;
  }
}

function normalize(node: ShopifyProductNode, shop: string, shopCurrency: string) {
  const variants = node.variants.nodes.map((variant) => {
    const contextual = variant.contextualPricing?.price;
    const currency = contextual?.currencyCode ?? shopCurrency;
    return {
      id: numericId(variant.id),
      title: variant.title,
      price: { amountMinor: minorUnits(contextual?.amount ?? variant.price, currency), currency },
      available: variant.availableForSale,
      barcode: variant.barcode,
      sku: variant.sku,
    };
  });
  if (!variants.length) return null;
  const cheapest = variants.reduce((low, variant) =>
    variant.price.amountMinor < low.price.amountMinor ? variant : low,
  );
  const first = variants[0];
  const gtin = first.barcode?.trim() ?? "";
  const parsed = externalProductSchema.safeParse({
    provider: "shopify",
    externalId: numericId(node.id),
    name: node.title.trim(),
    description: (node.description ?? "").slice(0, 20000),
    price: cheapest.price,
    available: variants.some((variant) => variant.available),
    brand: node.vendor?.trim() || null,
    // Only real GTIN/UPC/EAN digits; a barcode field can hold anything.
    gtin: /^\d{8,14}$/.test(gtin) ? gtin : null,
    sku: first.sku?.trim() || null,
    images: node.media.nodes.flatMap((media) => (media.image ? [media.image.url] : [])),
    productUrl: node.onlineStoreUrl ?? `https://${shop}/products/${node.handle}`,
    variants: variants.map(({ id, title, price, available }) => ({ id, title, price, available })),
  });
  if (!parsed.success) {
    console.warn(`Skipping invalid Shopify product ${node.id} from ${shop}`, parsed.error.issues);
    return null;
  }
  return parsed.data;
}

/** What a search asked for, checked on the products Shopify returned. */
function matches(product: ExternalProduct, query: ProviderSearchQuery) {
  if (query.inStock && !product.available) return false;
  if (query.currency && product.price.currency !== query.currency) return false;
  if (query.maxPriceMinor !== undefined && product.price.amountMinor > query.maxPriceMinor) {
    return false;
  }
  return true;
}

type Graphql = <T>(
  query: string,
  variables: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<T>;

export class ShopifyProductProvider implements ProductProvider {
  constructor(
    readonly merchant: ProviderMerchant,
    private readonly shop: string,
    private readonly graphql: Graphql,
  ) {}

  async search(query: ProviderSearchQuery, signal: AbortSignal): Promise<ProviderPage> {
    const data = await this.graphql<{
      shop: { currencyCode: string };
      products: {
        edges: Array<{ cursor: string; node: ShopifyProductNode }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(
      SEARCH_QUERY,
      {
        query: shopifySearchQuery(query),
        first: query.first,
        after: query.after ?? null,
        // Relevance needs search terms; without them, Shopify's default ID order is stable.
        sortKey: query.q.trim() ? "RELEVANCE" : null,
        ...this.country(query.country),
      },
      signal,
    );
    const items = data.products.edges.flatMap(({ cursor, node }) => {
      const product = mapShopifyProduct(node, this.shop, data.shop.currencyCode);
      return product && matches(product, query) ? [{ product, cursor }] : [];
    });
    return {
      items,
      end: data.products.pageInfo.endCursor,
      hasMore: data.products.pageInfo.hasNextPage,
    };
  }

  /**
   * The same query search uses, narrowed to these IDs, so a product is found exactly when search
   * could have returned it. IDs are digits only (validated), so they can't inject filters.
   */
  async get(externalIds: string[], options: { country?: string }, signal: AbortSignal) {
    const ids = externalIds.filter((id) => /^\d{1,20}$/.test(id));
    if (!ids.length) return [];
    const data = await this.graphql<{
      shop: { currencyCode: string };
      products: { edges: Array<{ node: ShopifyProductNode }> };
    }>(
      SEARCH_QUERY,
      {
        query: `(${ids.map((id) => `id:${id}`).join(" OR ")}) AND ${SEARCHABLE}`,
        first: ids.length,
        after: null,
        sortKey: null,
        ...this.country(options.country),
      },
      signal,
    );
    return data.products.edges.flatMap(({ node }) => {
      const product = mapShopifyProduct(node, this.shop, data.shop.currencyCode);
      return product ? [product] : [];
    });
  }

  private country(country: string | undefined) {
    return country ? { country, hasCountry: true } : { hasCountry: false };
  }
}

/** Calls the shop's Admin GraphQL API with a fresh token; GraphQL errors throw. */
export function shopifyGraphql(
  shop: string,
  connectionId: string,
  db: Database,
  send: typeof fetch = fetch,
): Graphql {
  return async (query, variables, signal) => {
    const accessToken = await shopifyAccessToken(connectionId, db);
    const response = await send(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({ query, variables }),
      signal,
    });
    if (!response.ok) throw new Error(`Shopify ${shop} answered HTTP ${response.status}`);
    const payload = (await response.json()) as {
      data?: unknown;
      errors?: Array<{ message: string }>;
    };
    if (payload.errors?.length || !payload.data) {
      const detail = payload.errors?.map((error) => error.message).join("; ") ?? "no data";
      throw new Error(`Shopify ${shop}: ${detail.slice(0, 500)}`);
    }
    return payload.data as never;
  };
}

/**
 * Every store a search may reach: enabled Shopify connections with credentials, optionally one
 * merchant. Ordered by merchant ID so round-robin order is stable across pages.
 */
export async function shopifyProviders(
  options: { merchantIds?: string[] } = {},
  db: Database = database(),
): Promise<ShopifyProductProvider[]> {
  const rows = await db
    .select({
      connectionId: merchantConnections.id,
      shop: merchantConnections.shopDomain,
      merchantId: merchants.id,
      name: merchants.name,
      slug: merchants.slug,
    })
    .from(merchantConnections)
    .innerJoin(merchants, eq(merchants.id, merchantConnections.merchantId))
    .where(
      and(
        eq(merchantConnections.enabled, true),
        eq(merchantConnections.connectorType, "shopify"),
        isNotNull(merchantConnections.credentialsEncrypted),
        isNotNull(merchantConnections.shopDomain),
      ),
    )
    .orderBy(merchants.id);
  return rows
    .filter((row) => !options.merchantIds || options.merchantIds.includes(row.merchantId))
    .map(
      (row) =>
        new ShopifyProductProvider(
          { id: row.merchantId, name: row.name, slug: row.slug },
          row.shop!,
          shopifyGraphql(row.shop!, row.connectionId, db),
        ),
    );
}
