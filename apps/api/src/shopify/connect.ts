import {
  beginStoreConnection,
  type StoreConnectionDeps,
  type StoreConnectionFailure,
} from "@shopping-mcp/commerce/store-connection";
import {
  connectFailureMessages,
  shopifyConnectRequestSchema,
  type ShopifyConnectResponse,
} from "@shopping-mcp/contracts";

const statuses: Record<StoreConnectionFailure, number> = {
  invalid_shop: 400,
  shop_not_found: 404,
  invalid_hmac: 403,
  invalid_state: 403,
  shop_taken: 409,
  token_exchange_failed: 502,
  shop_verification_failed: 502,
};

/** For the profile's own request: the status, the reason code, and the message to show. */
export function storeConnectionFailure(reason: StoreConnectionFailure) {
  return Response.json(
    { error: connectFailureMessages[reason], reason },
    { status: statuses[reason] },
  );
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
    return Response.json(
      { error: connectFailureMessages.unavailable, reason: "unavailable" },
      { status: 503 },
    );
  }
}
