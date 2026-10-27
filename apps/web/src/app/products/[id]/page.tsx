import { cache } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { parseProductId } from "@shopping-mcp/contracts";
import { loadProduct } from "@/features/products/api";
import { ProductDetail } from "@/features/products/product-detail";
import { ProductUnavailable } from "@/features/products/product-unavailable";

// One lookup per request, shared by the metadata and the page.
const product = cache(loadProduct);

const idFrom = async (params: Promise<{ id: string }>) => {
  const { id } = await params;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = await idFrom(params);
  const found = parseProductId(id)
    ? await product(id).catch((error) => {
        unstable_rethrow(error);
        return null;
      })
    : null;
  return { title: `${found?.name ?? "Product"} · Shopping with Agent` };
}

/** One product, live from its store. Direct links, refreshes and back/forward all load it here. */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const id = await idFrom(params);
  if (!parseProductId(id)) notFound();
  let found;
  try {
    found = await product(id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Product load failed", error);
    return <ProductUnavailable />;
  }
  if (!found) notFound();
  return <ProductDetail product={found} />;
}
