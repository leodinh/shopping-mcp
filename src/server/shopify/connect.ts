import { randomBytes } from "node:crypto";
import { database, type Database } from "@/server/db/client";
import { requireSession } from "@/server/auth/session";
import { ensureMerchantForShop } from "@/server/merchants/service";
import { oauthAttempts } from "@/server/db/schema";

const SHOP_DOMAIN = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
const ATTEMPT_TTL_MS = 10 * 60 * 1000;

export function normalizeShopDomain(input: unknown) {
  if (typeof input !== "string" || !input.trim()) throw new Error("Invalid shop domain");
  let hostname: string;
  try {
    const trimmed = input.trim().toLowerCase();
    hostname = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    throw new Error("Invalid shop domain");
  }
  if (!SHOP_DOMAIN.test(hostname)) throw new Error("Invalid shop domain");
  return hostname;
}

export function shopifyAuthorizeUrl(shop: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY ?? "",
    scope: process.env.SHOPIFY_SCOPES ?? "read_products",
    redirect_uri: process.env.SHOPIFY_REDIRECT_URI ?? "",
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params}`;
}

export async function startShopifyConnect(
  shop: unknown,
  merchantId: string,
  browserBinding: string,
  db: Database = database(),
) {
  const normalized = normalizeShopDomain(shop);
  const state = randomBytes(16).toString("hex");
  await db.insert(oauthAttempts).values({
    state,
    merchantId,
    shop: normalized,
    browserBinding,
    expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
  });
  return { authorizationUrl: shopifyAuthorizeUrl(normalized, state) };
}

function hasSessionCookie(cookieHeader: string | null) {
  return /(?:^|;\s*)session=/.test(cookieHeader ?? "");
}

export async function handleShopifyConnect(request: Request, db: Database = database()) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const body = (await request.json().catch(() => ({}))) as { shop?: unknown };
    const shop = normalizeShopDomain(body.shop);
    const merchantId = hasSessionCookie(cookieHeader)
      ? await requireSession(cookieHeader, db)
      : await ensureMerchantForShop(shop, db);
    const browserBinding = randomBytes(16).toString("hex");
    const response = Response.json(
      await startShopifyConnect(shop, merchantId, browserBinding, db),
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
