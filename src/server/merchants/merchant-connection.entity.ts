export type ConnectorType = "shopify";

export type ShopifyConnectionConfig = { shop: string };
export type ConnectionConfig = ShopifyConnectionConfig;

/** One connection per merchant. Shopify credentials live in credentials_encrypted, not config. */
export type MerchantConnection = {
  id: string;
  merchantId: string;
  connectorType: ConnectorType;
  config: ConnectionConfig;
  enabled: boolean;
  lastSyncedAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};
