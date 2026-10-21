import { z } from "zod";

export const shopifyConnectRequestSchema = z.object({ shop: z.string() });
export const shopifyConnectResponseSchema = z.object({ authorizationUrl: z.url() });
export type ShopifyConnectRequest = z.infer<typeof shopifyConnectRequestSchema>;
export type ShopifyConnectResponse = z.infer<typeof shopifyConnectResponseSchema>;

/**
 * Why connecting a store failed. The API answers these to the profile's own request, and sends the
 * browser back to `/profile?connect_error=<reason>` when Shopify's callback fails.
 */
export const connectFailureSchema = z.enum([
  "invalid_shop",
  "shop_not_found",
  "invalid_hmac",
  "invalid_state",
  "shop_taken",
  "token_exchange_failed",
  "shop_verification_failed",
  "unavailable",
]);
export type ConnectFailure = z.infer<typeof connectFailureSchema>;

/** What the store owner reads: what happened, then what to do. One copy for API and web. */
export const connectFailureMessages: Record<ConnectFailure, string> = {
  invalid_shop:
    "Connect failed: that isn't a Shopify store domain. Enter it like your-store.myshopify.com and try again.",
  shop_not_found:
    "Connect failed: no Shopify store was found at that address. Check the spelling and try again.",
  invalid_hmac: "Connect failed: we couldn't verify the reply from Shopify. Please try again.",
  invalid_state:
    "Connect failed: the request expired or was finished in another browser. Please try again from this page.",
  shop_taken: "Connect failed: this store is already connected to another account.",
  token_exchange_failed: "Connect failed: Shopify didn't grant access. Please try again.",
  shop_verification_failed:
    "Connect failed: Shopify didn't confirm the store. Please try again in a moment.",
  unavailable: "Connect failed: something went wrong on our side. Please try again in a moment.",
};

/** The message for a `connect_error` value; anything unrecognized reads as a generic failure. */
export function connectFailureMessage(reason: unknown) {
  const parsed = connectFailureSchema.safeParse(reason);
  return connectFailureMessages[parsed.success ? parsed.data : "unavailable"];
}
