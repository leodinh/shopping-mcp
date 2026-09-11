/** One-time Shopify (or other) OAuth start, bound to a browser until callback. */
export type OAuthAttempt = {
  id: string;
  state: string;
  merchantId: string;
  shop: string;
  browserBinding: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};
