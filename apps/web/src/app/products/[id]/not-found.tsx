import { Slip } from "@/features/account/slip";
import { BackToResults } from "@/features/products/back-to-results";

export default function ProductNotFound() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <BackToResults />
      </div>
      <Slip label="Product not found" className="mx-auto mt-8 max-w-[28rem] p-6 sm:p-10">
        <h1 className="caps text-headline font-bold text-heading">Product not found</h1>
        <p className="mt-4 text-intro text-muted">
          Its store no longer has it, or the link is incomplete. Ask your assistant to search again.
        </p>
      </Slip>
    </main>
  );
}
