import { browseKeys, searchParams, type BrowseKey } from "@shopping-mcp/contracts";

export type View = "grid" | "list";
/** A search as the results page's URL carries it: the API's own parameter names, as strings. */
export type BrowseQuery = Partial<Record<BrowseKey, string>>;
export type Browse = { query: BrowseQuery; page: number; view: View };

/** The results page's state from its URL. Anything unexpected falls back to page 1 in a grid. */
export function readBrowse(params: URLSearchParams): Browse {
  const query: BrowseQuery = {};
  for (const key of browseKeys) {
    const value = params.get(key);
    if (value) query[key] = value;
  }
  const page = Number(params.get("page"));
  return {
    query,
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
    view: params.get("view") === "list" ? "list" : "grid",
  };
}

/** One string per search, whatever order its parameters came in: the page cache's key. */
export const searchKey = (query: BrowseQuery) => searchParams(query).toString();

export function browseHref(query: BrowseQuery, { page = 1, view = "grid" }: Partial<Browse> = {}) {
  const params = searchParams(query);
  if (page > 1) params.set("page", String(page));
  if (view === "list") params.set("view", "list");
  const search = params.toString();
  return `/products${search ? `?${search}` : ""}`;
}

/** Filters a shopper can change here; the query itself (and the buyer's country) come from the assistant. */
export const hasFilters = (query: BrowseQuery) =>
  Boolean(query.merchantId || query.currency || query.maxPrice || query.inStock === "true");

export const withoutFilters = ({ q, country }: BrowseQuery): BrowseQuery => ({ q, country });
