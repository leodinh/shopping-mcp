import {
  completeStoreConnection,
  type StoreConnectionDeps,
} from "@shopping-mcp/commerce/store-connection";
import { sellerDashboardUrl } from "@shopping-mcp/config";
import { storeConnectionFailure } from "./connect";

export async function handleShopifyCallback(request: Request, deps: StoreConnectionDeps = {}) {
  try {
    const url = new URL(request.url);
    const browserBinding =
      request.headers.get("cookie")?.match(/(?:^|;\s*)oauth_binding=([^;]+)/)?.[1] ?? "";
    const result = await completeStoreConnection(url.searchParams, browserBinding, deps);
    if (!result.ok) return storeConnectionFailure(result.reason);
    // Shopify only authorized the store; the User is already signed in through Better Auth.
    return new Response(null, {
      status: 302,
      headers: { Location: sellerDashboardUrl(), "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Shopify callback failed", error);
    return Response.json({ error: "Shopify callback unavailable." }, { status: 503 });
  }
}
