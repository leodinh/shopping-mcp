"use client";

import { useCallback, useState, type ReactNode } from "react";

const LEAVE_MS = 200;

/**
 * The page's receipt slip: prints in on arrival; when `leaving`, fades out before the page moves on.
 * Callers only set `leaving` once navigation is certain, so a failure never animates the form away.
 */
export function Slip({
  leaving = false,
  label,
  className = "",
  children,
}: {
  leaving?: boolean;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      aria-busy={leaving}
      className={`slip ${leaving ? "pointer-events-none animate-vanish" : "animate-print"} ${className}`}
    >
      {children}
    </section>
  );
}

/** Fade the slip out, then navigate. Reduced motion skips the wait. */
export function useLeave() {
  const [leaving, setLeaving] = useState(false);
  const leave = useCallback((go: () => void) => {
    setLeaving(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(go, reduce ? 0 : LEAVE_MS);
  }, []);
  return { leaving, leave };
}
