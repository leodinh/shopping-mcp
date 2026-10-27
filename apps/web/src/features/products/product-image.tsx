"use client";

import { useState } from "react";

/**
 * A store's catalog photo in its frame. Missing or broken, the frame stays (no layout shift) and
 * says so. Merchant image hosts aren't known ahead of time, so this is a plain lazy <img>.
 */
export function ProductImage({
  src,
  alt,
  eager = false,
  className = "",
}: {
  src: string | undefined;
  alt: string;
  eager?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!src || broken === src) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt ? `${alt}: no image` : undefined}
        className={`product-image flex items-center justify-center ${className}`}
      >
        <span aria-hidden className="caps text-label text-muted">
          No image
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      onError={() => setBroken(src)}
      className={`product-image ${className}`}
    />
  );
}
