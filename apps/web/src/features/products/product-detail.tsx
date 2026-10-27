import type { ReactNode } from "react";
import type { CatalogProduct } from "@shopping-mcp/contracts";
import { Slip } from "../account/slip";
import { BackToResults } from "./back-to-results";
import { formatPrice, priceLabel, purchaseUrl } from "./format";
import { Gallery } from "./gallery";
import { ExternalIcon } from "./icons";

/** LABEL ........ VALUE */
function Line({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="leaders">
      <dt className="caps shrink-0 text-label text-muted">{term}</dt>
      <dd className="min-w-0 break-words text-base text-heading">{children}</dd>
    </div>
  );
}

const Tear = () => <div className="tear my-8" />;

/** One product as its store serves it now, with the way to buy it there. */
export function ProductDetail({ product }: { product: CatalogProduct }) {
  const href = purchaseUrl(product.productUrl);
  const facts = (
    [
      ["Brand", product.brand],
      ["SKU", product.sku],
      ["Barcode", product.gtin],
    ] as const
  ).filter(([, value]) => value);
  const description = product.description.trim();

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-5 py-4 sm:px-8 sm:py-8">
        <BackToResults />
        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-start lg:gap-12">
          <Gallery images={product.images} name={product.name} />
          <Slip label={product.name} className="p-6 sm:p-10">
            <p className="caps text-label text-muted">{product.merchant.name}</p>
            <h1 className="caps mt-2 text-headline font-bold text-heading [overflow-wrap:anywhere]">
              {product.name}
            </h1>
            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-base font-bold text-heading">{priceLabel(product)}</p>
              <p
                className={`caps text-label font-medium ${product.available ? "text-heading" : "text-muted"}`}
              >
                {product.available ? "[In stock]" : "[Sold out]"}
              </p>
            </div>

            {href ? (
              <a href={href} className="btn mt-6 w-full">
                Purchase
                <ExternalIcon />
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="btn mt-6 w-full disabled:cursor-not-allowed"
              >
                Purchase link unavailable
              </button>
            )}
            <p className="mt-3 text-label text-muted">
              {href
                ? `On ${product.merchant.name}’s own site (${new URL(href).hostname}), where checkout happens.`
                : `${product.merchant.name} didn’t give a link for this product. Look for it on their site.`}
            </p>

            {facts.length ? (
              <>
                <Tear />
                <dl className="flex flex-col gap-2.5">
                  {facts.map(([term, value]) => (
                    <Line key={term} term={term}>
                      {value}
                    </Line>
                  ))}
                </dl>
              </>
            ) : null}

            {product.variants.length > 1 ? (
              <>
                <Tear />
                <h2 className="caps text-label font-semibold text-heading">Options</h2>
                <dl className="mt-4 flex flex-col gap-2.5">
                  {product.variants.map((variant) => (
                    <div key={variant.id} className="leaders">
                      <dt className="min-w-0 break-words text-base text-heading">
                        {variant.title}
                      </dt>
                      <dd className="shrink-0 text-base whitespace-nowrap text-heading">
                        {formatPrice(variant.price)}
                        {variant.available ? null : (
                          <span className="caps ml-2 text-label text-muted">[Sold out]</span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}

            <Tear />
            <h2 className="caps text-label font-semibold text-heading">Description</h2>
            <p
              className={`mt-4 text-intro whitespace-pre-line [overflow-wrap:anywhere] ${description ? "text-heading" : "text-muted"}`}
            >
              {description || "The store gave no description."}
            </p>
            <p className="caps mt-8 text-label text-muted">
              Price and stock as {product.merchant.name} serves them now.
            </p>
          </Slip>
        </div>
      </div>
    </main>
  );
}
