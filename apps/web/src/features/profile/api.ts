import { sellerResponseSchema } from "@shopping-mcp/contracts";
import { apiUrl } from "../../lib/api/origin";

/** The API is the only judge of the session: 401 means no valid session (null); other failures throw. */
async function parseSeller(response: Response) {
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Store status unavailable");
  return sellerResponseSchema.parse(await response.json());
}

export async function fetchSeller(signal?: AbortSignal) {
  return parseSeller(await fetch(apiUrl("/api/seller"), { credentials: "include", signal }));
}

/** Server render: the same data, with the browser's cookies forwarded. */
export async function loadSeller(cookie: string) {
  return parseSeller(
    await fetch(apiUrl("/api/seller"), { headers: { cookie }, cache: "no-store" }),
  );
}
