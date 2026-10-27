import { Suspense } from "react";
import { loadStores } from "@/features/products/api";
import { currencyOptions } from "@/features/products/format";
import { Results } from "@/features/products/results";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q } = await searchParams;
  return {
    title:
      typeof q === "string" && q
        ? `Results for “${q}” · Shopping with Agent`
        : "Results · Shopping with Agent",
    // An assistant's search, not a catalog page.
    robots: { index: false },
  };
}

/** The results of a search an assistant ran, linked from its answer. */
export default async function ProductsPage() {
  return (
    <Suspense>
      <Results stores={await loadStores()} currencies={currencyOptions()} />
    </Suspense>
  );
}
