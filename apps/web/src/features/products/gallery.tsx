"use client";

import { useState } from "react";
import { ProductImage } from "./product-image";

/** The product's photos: one large, framed; thumbnails below choose which. */
export function Gallery({ images, name }: { images: string[]; name: string }) {
  const [selected, setSelected] = useState(0);
  return (
    <section aria-label="Product images" className="animate-print lg:sticky lg:top-6">
      {/* Remounting on change crossfades the new photo in. */}
      <ProductImage
        key={selected}
        src={images[selected]}
        alt={name}
        eager
        className="animate-stamp"
      />
      {images.length > 1 ? (
        <ul className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">
          {images.map((src, index) => (
            <li key={index}>
              <button
                type="button"
                aria-label={`Show image ${index + 1} of ${images.length}`}
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
                className={`block w-full cursor-pointer border border-ink bg-paper p-0 transition-[box-shadow,opacity] duration-150 ease-out active:translate-y-px ${
                  index === selected ? "ring-1 ring-ink ring-inset" : "opacity-60 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full object-contain"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
