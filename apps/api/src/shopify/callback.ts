import {
  completeStoreConnection,
  type StoreConnectionDeps,
} from "@shopping-mcp/commerce/store-connection";
import { sellerDashboardUrl } from "@shopping-mcp/config";
import { sessionCookie } from "../auth/session";
import { storeConnectionFailure } from "./connect";

export async function handleShopifyCallback(request: Request, deps: StoreConnectionDeps = {}) {
  try {
    const url = new URL(request.url);
    const browserBinding =
      request.headers.get("cookie")?.match(/(?:^|;\s*)oauth_binding=([^;]+)/)?.[1] ?? "";
    const result = await completeStoreConnection(url.searchParams, browserBinding, deps);
    if (!result.ok) return storeConnectionFailure(result.reason);
    const sellerUrl = sellerDashboardUrl();
    // 200 + same-site navigation: Chrome drops Set-Cookie on a cross-site 302 bounce.
    return new Response(
      `<!doctype html><meta http-equiv="refresh" content="0;url=${sellerUrl}"><script>location.replace(${JSON.stringify(sellerUrl)})</script><a href="${sellerUrl}">Continue</a>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Set-Cookie": sessionCookie(result.sessionToken),
        },
      },
    );
  } catch (error) {
    console.error("Shopify callback failed", error);
    return Response.json({ error: "Shopify callback unavailable." }, { status: 503 });
  }
}
