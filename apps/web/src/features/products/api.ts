import { unstable_rethrow } from "next/navigation";
import {
  productResponseSchema,
  searchParams,
  searchResultSchema,
  sellerStatusSchema,
} from "@shopping-mcp/contracts";
import { apiUrl } from "../../lib/api/origin";
import type { BrowseQuery } from "./browse";

/** `invalid`: the API refused the parameters or the cursor (400). `unavailable`: anything else. */
export class ResultsError extends Error {
  constructor(readonly kind: "invalid" | "unavailable") {
    super(kind === "invalid" ? "Search parameters refused" : "Search unavailable");
  }
}

export async function fetchResults(
  query: BrowseQuery,
  cursor: string | null,
  signal?: AbortSignal,
) {
  const params = searchParams(query);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(apiUrl(`/api/products?${params}`), {
    credentials: "include",
    signal,
  });
  if (response.status === 400) throw new ResultsError("invalid");
  if (!response.ok) throw new ResultsError("unavailable");
  return searchResultSchema.parse(await response.json());
}

/** Server render: one product, live from its store. Null when it doesn't exist; other failures throw. */
export async function loadProduct(id: string) {
  const response = await fetch(apiUrl(`/api/products/${encodeURIComponent(id)}`), {
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error(`Product lookup failed (${response.status})`);
  return productResponseSchema.parse(await response.json()).product;
}

export type StoreOption = { id: string; name: string };

/** Server render: the connected stores, for the store filter. Empty when they can't be listed. */
export async function loadStores(): Promise<StoreOption[]> {
  try {
    const response = await fetch(apiUrl("/api/merchants"), { cache: "no-store" });
    if (!response.ok) return [];
    return sellerStatusSchema
      .array()
      .parse(await response.json())
      .filter((store) => store.status === "connected")
      .map(({ id, name }) => ({ id, name }));
  } catch (error) {
    unstable_rethrow(error); // Next's own signals (dynamic rendering) aren't failures
    console.error("Store list failed", error);
    return [];
  }
}
