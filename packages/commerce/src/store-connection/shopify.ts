import { createHmac, timingSafeEqual } from "node:crypto";
import {
  shopifyApiKey,
  shopifyApiSecret,
  shopifyRedirectUri,
  shopifyScopes,
} from "@shopping-mcp/config";

const SHOP_DOMAIN = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export function normalizeShopDomain(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const trimmed = input.trim().toLowerCase();
    const { hostname } = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return SHOP_DOMAIN.test(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

export function shopifyAuthorizeUrl(shop: string, state: string) {
  const params = new URLSearchParams({
    client_id: shopifyApiKey(),
    scope: shopifyScopes(),
    redirect_uri: shopifyRedirectUri(),
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params}`;
}

export function validShopifyHmac(searchParams: URLSearchParams) {
  const hmac = searchParams.get("hmac");
  const secret = shopifyApiSecret();
  if (!hmac || !secret) return false;
  const message = [...searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const expected = Buffer.from(createHmac("sha256", secret).update(message).digest("hex"));
  const actual = Buffer.from(hmac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Whether Shopify has the shop, asked before anyone is sent there. */
export type ShopExists = (shop: string) => Promise<boolean>;

/**
 * Asks for the very page the browser would be sent to, without following redirects. A shop that
 * doesn't exist answers 404 with Shopify's "will be right back" page, which would strand the store
 * owner outside our app. Fails open: anything but a definite 404 (a real shop's 3xx, a closed or
 * bot-protected store, a timeout) lets the connection go ahead, so a real store is never blocked.
 */
export async function shopifyShopExists(shop: string, send: typeof fetch = fetch) {
  try {
    const response = await send(`https://${shop}/admin/oauth/authorize`, {
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    return response.status !== 404;
  } catch {
    return true;
  }
}
