import { searchResultSchema, type SearchResult } from "@shopping-mcp/contracts";

/** Cursors expire 30 minutes after they're issued; stop trusting one a little before. */
export const CURSOR_MAX_AGE_MS = 25 * 60 * 1000;
// Pages are kept for showing again, not for detail: the product page fetches live.
const EXCERPT = 400;
const STORAGE_KEY = "products:results";
const RETURN_KEY = "products:return";

export type CachedPage = { result: SearchResult; at: number };
/** One search's pages as fetched, in order (page N is `pages[N - 1]`), and when. */
export type History = { key: string; pages: CachedPage[] };

/** Saved by an older build, or edited: start over rather than trust it. */
function parseHistory(value: unknown): History | null {
  if (!value || typeof value !== "object") return null;
  const { key, pages } = value as { key?: unknown; pages?: unknown };
  if (typeof key !== "string" || !Array.isArray(pages)) return null;
  const parsed: CachedPage[] = [];
  for (const page of pages) {
    const result = searchResultSchema.safeParse(page?.result);
    if (!result.success || typeof page.at !== "number") return null;
    parsed.push({ result: result.data, at: page.at });
  }
  return { key, pages: parsed };
}

export type Step = { kind: "fetch"; cursor: string | null } | { kind: "restart" };

export function cachedPage(history: History | null, key: string, page: number) {
  return history?.key === key ? history.pages[page - 1] : undefined;
}

/**
 * How to get a page that isn't cached: page 1 from the start, page N with page N-1's cursor while
 * it's fresh. Without one (a shared link, an expired session) the search starts over.
 */
export function nextStep(
  history: History | null,
  key: string,
  page: number,
  now = Date.now(),
): Step {
  if (page === 1) return { kind: "fetch", cursor: null };
  const before = cachedPage(history, key, page - 1);
  if (!before?.result.nextCursor || now - before.at > CURSOR_MAX_AGE_MS) return { kind: "restart" };
  return { kind: "fetch", cursor: before.result.nextCursor };
}

/** The history with `result` as page `page`; another search replaces it. */
export function record(
  history: History | null,
  key: string,
  page: number,
  result: SearchResult,
  at: number,
): History {
  const pages = history?.key === key ? history.pages.slice(0, page - 1) : [];
  const products = result.products.map((product) => ({
    ...product,
    description: product.description.slice(0, EXCERPT),
  }));
  return { key, pages: [...pages, { result: { ...result, products }, at }] };
}

// One search's pages for this tab, mirrored to sessionStorage so a refresh or the way back from
// a product shows them again without asking the stores.
let current: History | null | undefined;
const listeners = new Set<() => void>();

function read(): History | null {
  if (current === undefined) {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      current = saved ? parseHistory(JSON.parse(saved)) : null;
    } catch {
      current = null;
    }
  }
  return current;
}

/** For `useSyncExternalStore`: the server has no history. */
export const resultsStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  get: read,
  getServer: (): History | null => null,
  save(next: History) {
    current = next;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: this tab keeps the pages in memory only.
    }
    for (const listener of listeners) listener();
  },
};

/** Remember where the shopper was on the results page before opening a product. */
export function rememberReturn(href: string, scrollTop: number) {
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ href, scrollTop }));
  } catch {}
}

export function readReturn(): { href: string; scrollTop: number } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null");
    return saved && typeof saved.href === "string" && typeof saved.scrollTop === "number"
      ? saved
      : null;
  } catch {
    return null;
  }
}

export function forgetReturn() {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {}
}
