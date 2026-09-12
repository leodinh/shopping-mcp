/** Seller-status read model: merchant + connection + product count. Not the Merchant row. */
export type MerchantStatus = {
  id: string;
  slug: string;
  name: string;
  connectionId: string | null;
  connectorType: "demo" | "shopify" | null;
  enabled: boolean | null;
  lastSyncedAt: Date | null;
  lastError: string | null;
  productCount: number;
};
