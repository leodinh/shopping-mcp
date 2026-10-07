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
/** The signed-in User and the stores they own; `user` is null when signed out. */
export const sellerResponseSchema = z.object({
  user: z.object({ id: z.uuid(), email: z.string() }).nullable(),
  stores: z.array(sellerStatusSchema),
});
export type SellerStatus = z.infer<typeof sellerStatusSchema>;
export type SellerResponse = z.infer<typeof sellerResponseSchema>;
