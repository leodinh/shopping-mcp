import { createHmac, timingSafeEqual } from "node:crypto";
import {
  shopifyApiKey,
  shopifyApiSecret,
  shopifyRedirectUri,
  shopifyScopes,
} from "@shopping-mcp/config";

const SHOP_DOMAIN = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export type ShopifyToken = {
  accessToken: string;
  refreshToken?: string;
  scope: string;
  expiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
};

/** Trades an OAuth callback code for an access token. Throws when Shopify refuses. */
export type ExchangeCode = (shop: string, code: string) => Promise<ShopifyToken>;

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

function expiry(seconds: number | undefined) {
  return seconds ? new Date(Date.now() + seconds * 1000) : null;
}

export const exchangeShopifyCode: ExchangeCode = async (shop, code) => {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: shopifyApiKey(),
      client_secret: shopifyApiSecret(),
      code,
      expiring: "1",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Token exchange failed: HTTP ${response.status}`);
  const token = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
  };
  if (!token.access_token) throw new Error("Token exchange failed: no access_token");
  return {
    accessToken: token.access_token,
    ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
    scope: token.scope ?? "",
    expiresAt: expiry(token.expires_in),
    refreshTokenExpiresAt: expiry(token.refresh_token_expires_in),
  };
};
