import { z } from "zod";

export const sellerStatusSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  connectionId: z.uuid().nullable(),
  connectorType: z.literal("shopify").nullable(),
  enabled: z.boolean().nullable(),
  lastSyncedAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  productCount: z.number().int().nonnegative(),
});
export const sellerResponseSchema = z.object({ merchant: sellerStatusSchema.nullable() });
export type SellerStatus = z.infer<typeof sellerStatusSchema>;
export type SellerResponse = z.infer<typeof sellerResponseSchema>;
