import {
  beginStoreConnection,
  type StoreConnectionDeps,
  type StoreConnectionFailure,
} from "@shopping-mcp/commerce/store-connection";
import { shopifyConnectRequestSchema, type ShopifyConnectResponse } from "@shopping-mcp/contracts";

const failures: Record<StoreConnectionFailure, [status: number, error: string]> = {
  invalid_shop: [400, "Invalid shop domain"],
  invalid_hmac: [403, "Invalid HMAC"],
  invalid_state: [403, "Invalid state"],
  shop_taken: [409, "Shop already connected"],
  token_exchange_failed: [502, "Shopify did not grant access. Try connecting again."],
};

export function storeConnectionFailure(reason: StoreConnectionFailure) {
  const [status, error] = failures[reason];
  return Response.json({ error }, { status });
}

/** Begins connecting a Shopify store for the signed-in User (null when signed out). */
export async function handleShopifyConnect(
  request: Request,
  userId: string | null,
  deps: StoreConnectionDeps = {},
) {
  if (!userId) {
    return Response.json({ error: "Sign in to connect a store." }, { status: 401 });
  }
  try {
    const body = shopifyConnectRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return storeConnectionFailure("invalid_shop");
    const result = await beginStoreConnection(body.data.shop, userId, deps);
    if (!result.ok) return storeConnectionFailure(result.reason);
    const response = Response.json({
      authorizationUrl: result.authorizationUrl,
    } satisfies ShopifyConnectResponse);
    const maxAge = Math.floor((result.expiresAt.getTime() - Date.now()) / 1000);
    response.headers.append(
      "set-cookie",
      `oauth_binding=${result.browserBinding}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`,
    );
    return response;
  } catch (error) {
    console.error("Shopify connect failed", error);
    return Response.json({ error: "Shopify connect unavailable." }, { status: 503 });
  }
}
