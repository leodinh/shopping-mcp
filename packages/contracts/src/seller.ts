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
/** What the profile shows about the signed-in User. `providers` lists linked sign-in providers. */
export const sellerUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string().nullable(),
  createdAt: z.iso.datetime(),
  providers: z.array(z.string()),
});
/** The signed-in User and the stores they own. Signed out, the API answers 401 instead. */
export const sellerResponseSchema = z.object({
  user: sellerUserSchema,
  stores: z.array(sellerStatusSchema),
});
export type SellerStatus = z.infer<typeof sellerStatusSchema>;
export type SellerUser = z.infer<typeof sellerUserSchema>;
export type SellerResponse = z.infer<typeof sellerResponseSchema>;
