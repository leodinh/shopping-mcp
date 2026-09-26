import { randomBytes } from "node:crypto";
import { shopifyApiKey, shopifyRedirectUri, shopifyScopes } from "@shopping-mcp/config";
import { database, oauthAttempts, type Database } from "@shopping-mcp/database";

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
    client_id: shopifyApiKey(),
    scope: shopifyScopes(),
    redirect_uri: shopifyRedirectUri(),
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
