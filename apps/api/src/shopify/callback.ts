import {
  completeStoreConnection,
  type StoreConnectionDeps,
} from "@shopping-mcp/commerce/store-connection";
import { profileUrl } from "@shopping-mcp/config";
import type { ConnectFailure } from "@shopping-mcp/contracts";

/**
 * Shopify sent the browser here, so a failure must not leave it on a bare JSON page: send it back
 * to the profile, which shows the message. Only the reason code travels in the URL.
 */
function backToProfile(reason?: ConnectFailure) {
  const location = new URL(profileUrl());
  if (reason) location.searchParams.set("connect_error", reason);
  return new Response(null, {
    status: 302,
    headers: { Location: location.href, "Cache-Control": "no-store" },
  });
}

export async function handleShopifyCallback(request: Request, deps: StoreConnectionDeps = {}) {
  try {
    const url = new URL(request.url);
    const browserBinding =
      request.headers.get("cookie")?.match(/(?:^|;\s*)oauth_binding=([^;]+)/)?.[1] ?? "";
    const result = await completeStoreConnection(url.searchParams, browserBinding, deps);
    if (!result.ok) return backToProfile(result.reason);
    // Shopify only authorized the store; the User is already signed in through Better Auth.
    return backToProfile();
  } catch (error) {
    console.error("Shopify callback failed", error);
    return backToProfile("unavailable");
  }
}
