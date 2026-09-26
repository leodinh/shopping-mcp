import { z } from "zod";

export const shopifyConnectRequestSchema = z.object({ shop: z.string() });
export const shopifyConnectResponseSchema = z.object({ authorizationUrl: z.url() });
export type ShopifyConnectRequest = z.infer<typeof shopifyConnectRequestSchema>;
export type ShopifyConnectResponse = z.infer<typeof shopifyConnectResponseSchema>;
