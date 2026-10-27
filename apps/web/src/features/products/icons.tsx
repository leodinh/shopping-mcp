// Stroked like the account menu's chevron: one weight, currentColor, decorative only.
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.25 } as const;

export function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 14 10"
      className={`h-2.5 w-3.5 ${direction === "left" ? "rotate-180" : ""}`}
    >
      <path d="M1 5h11M8 1l4 4-4 4" {...stroke} />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg aria-hidden viewBox="0 0 10 10" className="size-2.5">
      <path d="M3 1h6v6M9 1L1 9" {...stroke} />
    </svg>
  );
}

export function GridIcon() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3">
      <path d="M1 1h4v4H1zM7 1h4v4H7zM1 7h4v4H1zM7 7h4v4H7z" {...stroke} />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3">
      <path d="M1 1h3v3H1zM1 8h3v3H1zM6 2.5h5M6 9.5h5" {...stroke} />
    </svg>
  );
}

export function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 10 6" className={`h-1.5 w-2.5 ${className}`}>
      <path d="M1 1l4 4 4-4" {...stroke} />
    </svg>
  );
}
