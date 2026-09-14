import type { MerchantConnector } from "./contract";
import { shopifyConnector } from "./shopify";

const connectors: Record<string, MerchantConnector> = {
  shopify: shopifyConnector,
};

export function getConnector(type: string): MerchantConnector {
  const connector = connectors[type];
  if (!connector) throw new Error(`Unsupported connector: ${type}`);
  return connector;
}
