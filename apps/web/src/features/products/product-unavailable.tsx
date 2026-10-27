"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Slip } from "../account/slip";
import { BackToResults } from "./back-to-results";

/** The product's store didn't answer: say so, offer a retry, show no stale data. */
export function ProductUnavailable() {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <BackToResults />
      </div>
      <Slip label="Store unavailable" className="mx-auto mt-8 max-w-[28rem] p-6 sm:p-10">
        <h1 className="caps text-headline font-bold text-heading">The store didn’t answer</h1>
        <p className="mt-4 text-intro text-muted">
          This product is read live from its store, which couldn’t be reached just now. Try again in
          a moment.
        </p>
        <button
          type="button"
          disabled={retrying}
          onClick={() => startRetry(() => router.refresh())}
          className="btn mt-8"
        >
          {retrying ? "Trying again…" : "Try again"}
        </button>
      </Slip>
    </main>
  );
}
