import { completeShopifyConnect } from "@shopping-mcp/commerce/connectors/shopify";
import { sellerDashboardUrl } from "@shopping-mcp/config";
import { database, type Database } from "@shopping-mcp/database";
import { sessionCookie } from "../auth/session";

export async function handleShopifyCallback(request: Request, db: Database = database()) {
  try {
    const url = new URL(request.url);
    const browserBinding =
      request.headers.get("cookie")?.match(/(?:^|;\s*)oauth_binding=([^;]+)/)?.[1] ?? "";
    const result = await completeShopifyConnect(url.searchParams, browserBinding, db);
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
    const message = error instanceof Error ? error.message : "Request failed";
    if (message === "Invalid HMAC" || message === "Invalid state") {
      return Response.json({ error: message }, { status: 403 });
    }
    if (message === "Invalid shop domain")
      return Response.json({ error: message }, { status: 400 });
    if (message === "Unauthorized") return Response.json({ error: message }, { status: 401 });
    if (message === "Shop already connected")
      return Response.json({ error: message }, { status: 409 });
    console.error("Shopify callback failed", error);
    return Response.json({ error: "Shopify callback unavailable." }, { status: 503 });
  }
}
