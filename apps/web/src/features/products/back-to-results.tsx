"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { readReturn } from "./history";
import { ArrowIcon } from "./icons";

/**
 * Back to the results this product was opened from. Going back in history restores that page,
 * its view and scroll from the cache. Opened from an assistant's link, it leads to /products,
 * which explains where results come from.
 */
export function BackToResults() {
  const router = useRouter();

  function back(event: MouseEvent<HTMLAnchorElement>) {
    const saved = readReturn();
    if (!saved) return;
    event.preventDefault();
    if (window.history.length > 1) router.back();
    else router.push(saved.href);
  }

  return (
    <Link
      href="/products"
      onClick={back}
      className="btn-link inline-flex min-h-12 items-center gap-2"
    >
      <ArrowIcon direction="left" />
      Back to results
    </Link>
  );
}
