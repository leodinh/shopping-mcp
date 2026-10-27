import { ProductSkeleton } from "@/features/products/skeletons";

export default function Loading() {
  return (
    <main aria-busy className="min-h-0 flex-1 overflow-y-auto">
      <p role="status" className="sr-only">
        Loading product
      </p>
      <div className="mx-auto w-full max-w-6xl px-5 py-4 sm:px-8 sm:py-8">
        <ProductSkeleton />
      </div>
    </main>
  );
}
