"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Slip } from "../account/slip";
import { fetchResults, ResultsError, type StoreOption } from "./api";
import {
  browseHref,
  hasFilters,
  readBrowse,
  searchKey,
  withoutFilters,
  type BrowseQuery,
  type View,
} from "./browse";
import { Filters } from "./filters";
import type { CurrencyOption } from "./format";
import {
  cachedPage,
  forgetReturn,
  nextStep,
  readReturn,
  record,
  rememberReturn,
  resultsStore,
} from "./history";
import { ArrowIcon, GridIcon, ListIcon } from "./icons";
import { listClass, ProductCard } from "./product-card";
import { ResultsSkeleton } from "./skeletons";

const pad = (count: number) => String(count).padStart(2, "0");
const here = () => `${window.location.pathname}${window.location.search}`;

/** A dashed box for what the page has to say instead of (or about) its products. */
function Notice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="animate-stamp border border-dashed border-ink px-4 py-3 text-label text-heading">
      <span className="caps font-semibold">[{label}]</span> {children}
    </div>
  );
}

/** Bare /products: nothing was searched, and this page never lists the whole catalog. */
function Unsearched() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-12 sm:px-8">
      <Slip label="Results" className="mx-auto max-w-[28rem] p-6 sm:p-10">
        <h1 className="caps text-headline font-bold text-heading">Results</h1>
        <p className="mt-4 text-intro text-muted">
          When your assistant searches connected stores, it links here so you can look through what
          it found.
        </p>
        <div className="tear my-8" />
        <p className="text-base text-heading">
          Ask your assistant to search, then open the link it gives you.
        </p>
        <Link href="/docs" className="btn-secondary mt-6">
          How to add Shopping MCP
        </Link>
      </Slip>
    </main>
  );
}

/**
 * The results of a search an assistant ran, one page at a time. The URL holds the search, page
 * and view; pages already seen come from this tab's cache, new ones with the previous page's
 * cursor. Paging uses the History API, so cached pages switch with no request at all.
 */
export function Results({
  stores,
  currencies,
}: {
  stores: StoreOption[];
  currencies: CurrencyOption[];
}) {
  const params = useSearchParams();
  const { query, page, view: urlView } = readBrowse(params);
  const key = searchKey(query);
  const at = `${key}#${page}`;
  const history = useSyncExternalStore(
    resultsStore.subscribe,
    resultsStore.get,
    resultsStore.getServer,
  );
  const cached = cachedPage(history, key, page);
  const [view, setView] = useState<View>(urlView);
  const [failure, setFailure] = useState<{ at: string; kind: ResultsError["kind"] } | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [expired, setExpired] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const scroller = useRef<HTMLElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const failed = failure?.at === at ? failure.kind : null;
  const loading = !cached && !failed;

  // Fetch the page unless it's cached. The search is rebuilt from `key`, a string, so a new
  // render's query object doesn't refetch.
  useEffect(() => {
    if (cached || !key) return;
    const search = Object.fromEntries(new URLSearchParams(key)) as BrowseQuery;
    const firstPage = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("page");
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    };
    const step = nextStep(resultsStore.get(), key, page);
    if (step.kind === "restart") return firstPage();
    const controller = new AbortController();
    fetchResults(search, step.cursor, controller.signal).then(
      (result) => {
        resultsStore.save(record(resultsStore.get(), key, page, result, Date.now()));
        setFetchedAt(`${key}#${page}`);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ResultsError && error.kind === "invalid" && step.cursor) {
          setExpired(key);
          return firstPage();
        }
        setFailure({
          at: `${key}#${page}`,
          kind: error instanceof ResultsError ? error.kind : "unavailable",
        });
      },
    );
    return () => controller.abort();
  }, [cached, key, page, attempt]);

  // Coming back from a product: put the shopper where they were.
  useEffect(() => {
    if (!cached) return;
    const saved = readReturn();
    if (!saved) return;
    forgetReturn();
    if (saved.href === here() && scroller.current) scroller.current.scrollTop = saved.scrollTop;
  }, [cached]);

  // The URL follows the chosen view, so a refresh, a shared link or the way back keep it.
  useEffect(() => {
    if (key && urlView !== view) {
      window.history.replaceState(
        null,
        "",
        browseHref(Object.fromEntries(new URLSearchParams(key)), { page, view }),
      );
    }
  }, [key, page, urlView, view]);

  if (!key) return <Unsearched />;

  function go(href: string) {
    window.history.pushState(null, "", href);
    scroller.current?.scrollTo({ top: 0 });
    status.current?.focus({ preventScroll: true });
  }

  function choose(next: View) {
    if (next === view) return;
    const apply = () => flushSync(() => setView(next));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || !("startViewTransition" in document)) apply();
    else document.startViewTransition(apply);
  }

  const result = cached?.result;
  const products = result?.products ?? [];
  const stale = result?.stores.filter((store) => store.outcome === "stale_fallback") ?? [];
  const minutesOld = (fetched: string | null) =>
    cached && fetched ? Math.max(1, Math.round((cached.at - Date.parse(fetched)) / 60_000)) : 1;
  const filtered = hasFilters(query);
  const count = `${pad(products.length)} product${products.length === 1 ? "" : "s"}`;

  return (
    <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="animate-print">
          <h1 className="caps text-headline font-bold text-heading [overflow-wrap:anywhere]">
            {query.q ? `Results for “${query.q}”` : "Results"}
          </h1>
          <p className="mt-2 text-intro text-muted">Results from connected stores.</p>
        </header>

        <Filters
          key={key}
          query={query}
          stores={stores}
          currencies={currencies}
          onApply={(next) => go(browseHref(next, { view }))}
        />

        <div className="mt-6 flex items-center justify-between gap-4 border-b border-ink pb-3">
          <p
            ref={status}
            tabIndex={-1}
            role="status"
            // Focused only to announce a new page; it isn't a control, so no ring.
            className="caps text-label font-semibold text-heading outline-none"
          >
            Page {pad(page)}
            <span className="font-normal text-muted">
              {" · "}
              {loading ? "Loading products…" : failed ? "Not loaded" : count}
            </span>
          </p>
          <div role="group" aria-label="Layout" className="flex shrink-0">
            {(["grid", "list"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => choose(option)}
                className={`${view === option ? "btn" : "btn-secondary"} px-4 not-first:-ml-px`}
              >
                {option === "grid" ? <GridIcon /> : <ListIcon />}
                <span className="sr-only sm:not-sr-only">
                  {option === "grid" ? "Grid" : "List"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {result && (expired === key || result.partial || stale.length > 0) ? (
          <div className="mt-4 flex flex-col gap-2">
            {expired === key && page === 1 ? (
              <Notice label="Restarted">
                Those results had expired, so they start again from the first page.
              </Notice>
            ) : null}
            {result.partial ? (
              <Notice label="Partial">
                {result.unavailable.map((store) => store.name).join(", ")} didn’t answer, so their
                products may be missing from this page.
              </Notice>
            ) : null}
            {stale.map((store) => (
              <Notice key={store.merchantId} label="Earlier">
                {store.name} didn’t answer; its products are from {minutesOld(store.fetchedAt)} min
                ago.
              </Notice>
            ))}
          </div>
        ) : null}

        <section
          aria-label="Products"
          aria-busy={loading}
          className={view === "grid" ? "mt-6" : ""}
        >
          {loading ? (
            <ResultsSkeleton view={view} />
          ) : failed ? (
            <div className="animate-stamp border border-dashed border-ink p-6 sm:p-8">
              <h2 className="caps text-label font-semibold text-heading">
                {failed === "invalid" ? "These filters don’t work together" : "No store answered"}
              </h2>
              <p className="mt-2 text-muted">
                {failed === "invalid"
                  ? "Check that a max price has its currency, or clear the filters."
                  : "The stores couldn’t be reached right now. Try again in a moment."}
              </p>
              <button
                type="button"
                className="btn-secondary mt-6"
                onClick={() => {
                  if (failed === "invalid") return go(browseHref(withoutFilters(query), { view }));
                  setFailure(null);
                  setAttempt((count) => count + 1);
                }}
              >
                {failed === "invalid" ? "Clear filters" : "Try again"}
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="animate-stamp border border-dashed border-ink p-6 sm:p-8">
              <h2 className="caps text-label font-semibold text-heading">
                {page === 1 ? "No products match" : "No more products here"}
              </h2>
              <p className="mt-2 text-muted">
                {page > 1
                  ? "The stores had nothing further for this page."
                  : filtered
                    ? "Nothing in connected stores fits these filters. Try fewer of them."
                    : "Ask your assistant to search again with other words."}
              </p>
              {page === 1 && filtered ? (
                <button
                  type="button"
                  className="btn-secondary mt-6"
                  onClick={() => go(browseHref(withoutFilters(query), { view }))}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <ul key={at} className={listClass[view]}>
              {products.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  view={view}
                  index={index}
                  motion={fetchedAt === at ? "feed" : "stamp"}
                  onOpen={() => rememberReturn(here(), scroller.current?.scrollTop ?? 0)}
                />
              ))}
            </ul>
          )}
        </section>

        {page > 1 || result?.nextCursor ? (
          <nav
            aria-label="Result pages"
            className="mt-8 flex items-center justify-between gap-4 border-t border-ink pt-6"
          >
            <button
              type="button"
              className="btn-secondary disabled:cursor-not-allowed"
              disabled={page === 1}
              onClick={() => go(browseHref(query, { page: page - 1, view }))}
            >
              <ArrowIcon direction="left" />
              Previous
            </button>
            <p className="caps text-label text-muted">Page {pad(page)}</p>
            <button
              type="button"
              className="btn disabled:cursor-not-allowed"
              disabled={!result?.nextCursor}
              onClick={() => go(browseHref(query, { page: page + 1, view }))}
            >
              Next
              <ArrowIcon direction="right" />
            </button>
          </nav>
        ) : null}
      </div>
    </main>
  );
}
