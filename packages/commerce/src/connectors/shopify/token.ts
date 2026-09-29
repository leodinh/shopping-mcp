import { shopifyApiKey, shopifyApiSecret } from "@shopping-mcp/config";

export type ShopifyToken = {
  accessToken: string;
  refreshToken?: string;
  scope: string;
  expiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
};

/** Trades an OAuth callback code for an access token. Throws when Shopify refuses. */
export type ExchangeCode = (shop: string, code: string) => Promise<ShopifyToken>;

/** Shopify answered 4xx: the code or refresh token is expired, used, or revoked. */
export class ShopifyTokenRejected extends Error {}

function expiry(seconds: number | undefined) {
  return seconds ? new Date(Date.now() + seconds * 1000) : null;
}

async function requestToken(shop: string, grant: Record<string, string>): Promise<ShopifyToken> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: shopifyApiKey(),
      client_secret: shopifyApiSecret(),
      ...grant,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status >= 400 && response.status < 500) {
    throw new ShopifyTokenRejected(`Shopify token request rejected: HTTP ${response.status}`);
  }
  if (!response.ok) throw new Error(`Shopify token request failed: HTTP ${response.status}`);
  const token = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
  };
  if (!token.access_token) throw new Error("Shopify token request failed: no access_token");
  return {
    accessToken: token.access_token,
    ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
    scope: token.scope ?? "",
    expiresAt: expiry(token.expires_in),
    refreshTokenExpiresAt: expiry(token.refresh_token_expires_in),
  };
}

export const exchangeShopifyCode: ExchangeCode = (shop, code) =>
  requestToken(shop, { code, expiring: "1" });

export function refreshShopifyToken(shop: string, refreshToken: string) {
  return requestToken(shop, { grant_type: "refresh_token", refresh_token: refreshToken });
}
