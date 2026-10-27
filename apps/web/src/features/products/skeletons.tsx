import type { View } from "./browse";
import { itemClass, listClass } from "./product-card";

/** A blank receipt line: where text will print. */
const Line = ({ width, className = "" }: { width: string; className?: string }) => (
  <div className={`h-5 border-b border-dotted border-muted ${width} ${className}`} />
);

/** Placeholders in the active view's own geometry, so nothing moves when the products arrive. */
export function ResultsSkeleton({ view }: { view: View }) {
  const cells = Array.from({ length: view === "grid" ? 8 : 4 }, (_, index) => index);
  return (
    <ul aria-hidden className={`${listClass[view]} motion-safe:animate-pulse`}>
      {cells.map((index) => (
        <li key={index} className={itemClass[view]}>
          {view === "grid" ? (
            <div className="flex flex-col gap-3 p-3 sm:p-4">
              <div className="aspect-square w-full border border-dashed border-muted" />
              <div className="flex flex-col gap-1">
                <Line width="w-4/5" />
                <Line width="w-1/2" />
                <Line width="w-1/3" className="mt-2" />
              </div>
            </div>
          ) : (
            <div className="flex gap-4 p-4 sm:gap-6">
              <div className="aspect-square w-20 shrink-0 border border-dashed border-muted sm:w-32" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Line width="w-3/5" />
                <Line width="w-2/5" />
                <Line width="w-full" className="mt-3" />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The product page while its store answers: the gallery frame and a slip of blank lines. */
export function ProductSkeleton() {
  return (
    <div aria-hidden className="motion-safe:animate-pulse">
      <div className="h-5 w-40 border-b border-dotted border-muted" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-start lg:gap-12">
        <div>
          <div className="aspect-square w-full border border-dashed border-muted" />
          <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="aspect-square border border-dashed border-muted" />
            ))}
          </div>
        </div>
        <div className="slip flex flex-col gap-2 p-6 sm:p-10">
          <Line width="w-1/3" />
          <Line width="w-4/5" />
          <Line width="w-1/4" className="mt-4" />
          <div className="mt-6 min-h-12 border border-dashed border-muted" />
          <div className="tear my-6" />
          <Line width="w-full" />
          <Line width="w-full" />
          <Line width="w-2/3" />
        </div>
      </div>
    </div>
  );
}
