import { demoConnector } from "./demo";
import type { MerchantConnector } from "./contract";

export function getConnector(type: string): MerchantConnector {
  if (type === "demo") return demoConnector;
  throw new Error(`Unsupported connector: ${type}`);
}
