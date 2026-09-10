export type ConnectorType = "demo";

export type DemoConnectionConfig = { storeSlug: string };

/** One connection per merchant. */
export type MerchantConnection = {
  id: string;
  merchantId: string;
  connectorType: ConnectorType;
  config: DemoConnectionConfig;
  enabled: boolean;
  lastSyncedAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};
