/** Browser access to one store dashboard. Separate from Shopify API credentials. */
export type Session = {
  id: string;
  merchantId: string;
  expiresAt: Date;
  createdAt: Date;
};
