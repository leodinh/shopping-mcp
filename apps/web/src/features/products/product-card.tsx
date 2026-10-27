import Link from "next/link";
import type { CatalogProduct } from "@shopping-mcp/contracts";
import type { View } from "./browse";
import { priceLabel, productPath } from "./format";
import { ProductImage } from "./product-image";

// Grid cells share their rules: the grid draws the outer top/left edge, each cell its right/bottom.
export const listClass: Record<View, string> = {
  grid: "grid grid-cols-2 border-t border-l border-ink sm:grid-cols-3 lg:grid-cols-4",
  // The toolbar's rule above already closes the list's top.
  list: "",
};
export const itemClass: Record<View, string> = {
  grid: "border-r border-b border-ink",
  list: "border-b border-ink",
};

/**
 * One product in the results, the same item in either view so switching morphs it in place.
 * `motion`: `feed` for a page just fetched (staggered, capped at the fourth), `stamp` for one
 * shown again from the cache.
 */
export function ProductCard({
  product,
  view,
  index,
  motion,
  onOpen,
}: {
  product: CatalogProduct;
  view: View;
  index: number;
  motion: "feed" | "stamp";
  onOpen: () => void;
}) {
  const status = product.available ? null : (
    <span className="caps shrink-0 text-label font-medium text-muted">[Sold out]</span>
  );
  return (
    <li
      className={`${itemClass[view]} ${motion === "feed" ? "animate-feed" : "animate-stamp"}`}
      style={{
        viewTransitionName: `product-${index}`,
        animationDelay: motion === "feed" ? `${Math.min(index, 3) * 60}ms` : undefined,
      }}
    >
      <Link
        href={productPath(product.id)}
        onClick={onOpen}
        className={`group flex h-full text-heading no-underline transition-colors duration-150 ease-out hover:bg-wash/60 focus-visible:-outline-offset-2 ${
          view === "grid" ? "flex-col gap-3 p-3 sm:p-4" : "gap-4 p-4 sm:gap-6"
        }`}
      >
        <ProductImage
          src={product.images[0]}
          alt=""
          className={view === "grid" ? "" : "w-20 shrink-0 sm:w-32"}
        />
        {view === "grid" ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="caps line-clamp-3 font-semibold [overflow-wrap:anywhere]">
              {product.name}
            </h2>
            <p className="caps truncate text-label text-muted">{product.merchant.name}</p>
            <p className="mt-auto flex flex-wrap items-baseline justify-between gap-x-2 pt-2">
              <span className="font-semibold">{priceLabel(product)}</span>
              {status}
            </p>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <h2 className="caps font-semibold [overflow-wrap:anywhere]">{product.name}</h2>
              <p className="shrink-0 font-semibold">{priceLabel(product)}</p>
            </div>
            <p className="caps mt-1 flex flex-wrap gap-x-2 text-label text-muted">
              <span>{product.merchant.name}</span>
              {product.variants.length > 1 ? (
                <span>· {product.variants.length} options</span>
              ) : null}
              {status}
            </p>
            {product.description ? (
              <p className="mt-3 line-clamp-2 text-muted sm:line-clamp-3">{product.description}</p>
            ) : null}
          </div>
        )}
      </Link>
    </li>
  );
}
