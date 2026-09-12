import type { MerchantConnector } from "./contract";

export function getConnector(type: string): MerchantConnector {
  throw new Error(`Unsupported connector: ${type}`);
}
