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
