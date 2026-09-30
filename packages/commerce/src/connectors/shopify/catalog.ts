import { z } from "zod";
import { eq } from "drizzle-orm";
import { merchantConnections, type Database } from "@shopping-mcp/database";
import { minorUnits } from "../../catalog/money";
import type { ConnectorConnection, MerchantConnector, NormalizedProduct } from "../contract";
import { encryptCredentials, openCredentials } from "./credentials";
import { refreshShopifyToken, SHOPIFY_API_VERSION, ShopifyTokenRejected } from "./token";

const MAX_PRODUCTS = 10_000;
const PAGE_SIZE = 50;

const shopifyConfigSchema = z.object({
  shop: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
  accessToken: z.string().min(1),
});

type ShopifyNode = {
  id: string;
  title: string;
  description: string | null;
  handle: string;
  onlineStoreUrl: string | null;
  images: { nodes: Array<{ url: string }> };
  variants: { nodes: Array<{ price: string; inventoryQuantity: number | null }> };
};

export type ShopifyFetchOptions = {
  pageSize?: number;
  maxProducts?: number;
};

export function mapShopifyProduct(
  node: ShopifyNode,
  shop: string,
  currency: string,
): NormalizedProduct {
  const variant = node.variants.nodes[0];
  const price = variant?.price ?? "0";
  const externalId = node.id.includes("/") ? node.id.slice(node.id.lastIndexOf("/") + 1) : node.id;
  return {
    externalId,
    name: node.title.trim(),
    description: (node.description ?? "").slice(0, 20000),
    priceMinor: minorUnits(price),
    currency,
    images: node.images.nodes.map((image) => image.url).slice(0, 20),
    inventory: Math.max(0, variant?.inventoryQuantity ?? 0),
    productUrl: node.onlineStoreUrl ?? `https://${shop}/products/${node.handle}`,
  };
}

const PRODUCTS_QUERY = `#graphql
  query Products($cursor: String, $pageSize: Int!) {
    shop { currencyCode }
    products(first: $pageSize, after: $cursor) {
      nodes {
        id
        title
        description
        handle
        onlineStoreUrl
        images(first: 20) { nodes { url } }
        variants(first: 1) {
          nodes {
            price
            inventoryQuantity
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export async function fetchShopifyCatalog(
  config: unknown,
  options: ShopifyFetchOptions = {},
): Promise<NormalizedProduct[]> {
  const { shop, accessToken } = shopifyConfigSchema.parse(config);
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxProducts = options.maxProducts ?? MAX_PRODUCTS;
  const catalog: NormalizedProduct[] = [];
  let cursor: string | null = null;
  let currency = "USD";

  while (catalog.length < maxProducts) {
    const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: PRODUCTS_QUERY,
        variables: { cursor, pageSize },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Shopify catalog fetch failed (${response.status})`);
    }
    const payload = (await response.json()) as {
      errors?: Array<{ message: string }>;
      data?: {
        shop?: { currencyCode?: string };
        products?: {
          nodes: ShopifyNode[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    };
    if (payload.errors?.length) {
      throw new Error(
        payload.errors
          .map((error) => error.message)
          .join("; ")
          .slice(0, 500),
      );
    }
    const products = payload.data?.products;
    if (!products) throw new Error("Shopify catalog fetch returned no products");
    if (payload.data?.shop?.currencyCode) currency = payload.data.shop.currencyCode;

    for (const node of products.nodes) {
      catalog.push(mapShopifyProduct(node, shop, currency));
      if (catalog.length >= maxProducts) break;
    }
    if (!products.pageInfo.hasNextPage || catalog.length >= maxProducts) break;
    cursor = products.pageInfo.endCursor;
    if (!cursor) break;
  }

  return catalog;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const RECONNECT = "Shopify access expired. Reconnect your store.";

/**
 * Returns an access token Shopify will accept for the next few minutes. Rotated tokens are
 * written back immediately: once the new refresh token is used, the old one stops working.
 */
async function usableAccessToken(shop: string, connection: ConnectorConnection, db: Database) {
  if (!connection.credentialsEncrypted) throw new Error(RECONNECT);
  const { credentials, legacy } = openCredentials(connection.credentialsEncrypted);
  const expiring =
    connection.tokenExpiresAt !== null &&
    connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;
  if (!expiring) {
    if (legacy) {
      await db
        .update(merchantConnections)
        .set({ credentialsEncrypted: encryptCredentials(credentials) })
        .where(eq(merchantConnections.id, connection.id));
    }
    return credentials.accessToken;
  }
  if (!credentials.refreshToken) throw new Error(RECONNECT);
  let token;
  try {
    token = await refreshShopifyToken(shop, credentials.refreshToken);
  } catch (error) {
    if (error instanceof ShopifyTokenRejected) throw new Error(RECONNECT, { cause: error });
    throw error;
  }
  await db
    .update(merchantConnections)
    .set({
      credentialsEncrypted: encryptCredentials({
        accessToken: token.accessToken,
        refreshToken: token.refreshToken ?? credentials.refreshToken,
      }),
      tokenExpiresAt: token.expiresAt,
      ...(token.refreshToken ? { refreshTokenExpiresAt: token.refreshTokenExpiresAt } : {}),
      ...(token.scope ? { scopes: token.scope } : {}),
    })
    .where(eq(merchantConnections.id, connection.id));
  return token.accessToken;
}

export const shopifyConnector: MerchantConnector = {
  type: "shopify",
  async fetchCatalog(connection, db) {
    const shop = connection.config.shop;
    if (!shop) throw new Error(RECONNECT);
    const accessToken = await usableAccessToken(shop, connection, db);
    return fetchShopifyCatalog({ shop, accessToken });
  },
};
