import { randomBytes } from "node:crypto";
import { requireSession } from "@shopping-mcp/commerce/auth";
import { ensureMerchantForShop } from "@shopping-mcp/commerce/merchants";
import {
  normalizeShopDomain,
  startShopifyConnect,
} from "@shopping-mcp/commerce/connectors/shopify";
import { database, type Database } from "@shopping-mcp/database";
import { sessionToken } from "../auth/session";
import { shopifyConnectRequestSchema, type ShopifyConnectResponse } from "@shopping-mcp/contracts";

function hasSessionCookie(cookieHeader: string | null) {
  return /(?:^|;\s*)session=/.test(cookieHeader ?? "");
}

export async function handleShopifyConnect(request: Request, db: Database = database()) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const body = shopifyConnectRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) throw new Error("Invalid shop domain");
    const shop = normalizeShopDomain(body.data.shop);
    const merchantId = hasSessionCookie(cookieHeader)
      ? await requireSession(sessionToken(cookieHeader), db)
      : await ensureMerchantForShop(shop, db);
    const browserBinding = randomBytes(16).toString("hex");
    const response = Response.json(
      (await startShopifyConnect(
        shop,
        merchantId,
        browserBinding,
        db,
      )) satisfies ShopifyConnectResponse,
    );
    response.headers.append(
      "set-cookie",
      `oauth_binding=${browserBinding}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`,
    );
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    if (message === "Unauthorized") return Response.json({ error: message }, { status: 401 });
    if (message === "Invalid shop domain")
      return Response.json({ error: message }, { status: 400 });
    console.error("Shopify connect failed", error);
    return Response.json({ error: "Shopify connect unavailable." }, { status: 503 });
  }
}
