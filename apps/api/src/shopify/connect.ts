import {
  beginStoreConnection,
  type StoreConnectionDeps,
  type StoreConnectionFailure,
} from "@shopping-mcp/commerce/store-connection";
import { database } from "@shopping-mcp/database";
import { currentMerchantId } from "../auth/session";
import { shopifyConnectRequestSchema, type ShopifyConnectResponse } from "@shopping-mcp/contracts";

const failures: Record<StoreConnectionFailure, [status: number, error: string]> = {
  invalid_shop: [400, "Invalid shop domain"],
  invalid_hmac: [403, "Invalid HMAC"],
  invalid_state: [403, "Invalid state"],
  shop_taken: [409, "Shop already connected"],
  shop_mismatch: [409, "Your store is already connected to a different shop"],
  token_exchange_failed: [502, "Shopify did not grant access. Try connecting again."],
};

export function storeConnectionFailure(reason: StoreConnectionFailure) {
  const [status, error] = failures[reason];
  return Response.json({ error }, { status });
}

export async function handleShopifyConnect(request: Request, deps: StoreConnectionDeps = {}) {
  try {
    const db = deps.db ?? database();
    const body = shopifyConnectRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return storeConnectionFailure("invalid_shop");
    const merchantId = await currentMerchantId(request.headers.get("cookie"), db);
    const result = await beginStoreConnection(body.data.shop, merchantId, { ...deps, db });
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
