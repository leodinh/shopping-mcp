import { z } from "zod";
import { SHOPIFY_API_VERSION } from "./token";

export type ShopIdentity = { gid: string; name: string };

/** Proves a fresh access token works and reads who the shop is. Throws when Shopify refuses. */
export type VerifyShop = (shop: string, accessToken: string) => Promise<ShopIdentity>;

const shopResponseSchema = z.object({
  data: z.object({ shop: z.object({ id: z.string().min(1), name: z.string().min(1) }) }),
});

export const verifyShopifyShop: VerifyShop = async (shop, accessToken) => {
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query: "{ shop { id name } }" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Shopify shop query failed: HTTP ${response.status}`);
  const { shop: identity } = shopResponseSchema.parse(await response.json()).data;
  return { gid: identity.id, name: identity.name.trim() };
};
