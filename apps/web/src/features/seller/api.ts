import { sellerResponseSchema } from "@shopping-mcp/contracts";
import { apiUrl } from "../../lib/api/origin";

export async function fetchSeller(signal?: AbortSignal) {
  const response = await fetch(apiUrl("/api/seller"), { credentials: "include", signal });
  if (!response.ok) throw new Error("Store status unavailable");
  return sellerResponseSchema.parse(await response.json());
}
