"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { authClient } from "./auth-client";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 6"
      className={`h-1.5 w-2.5 transition-transform duration-150 ease-out ${open ? "rotate-180" : ""}`}
    >
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

/**
 * LOGIN when signed out; ACCOUNT with a PROFILE / LOGOUT menu when signed in. While the session
 * resolves, the header hides its whole nav (via data-pending), so neither label flashes nor moves.
 */
export function AccountMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const items = () =>
    Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  // Which item to focus once the menu has actually rendered open (keyboard opening only).
  const focusOnOpen = useRef<"first" | "last" | null>(null);

  function openAt(index: "first" | "last") {
    if (open) {
      // Already open (e.g. by mouse): the effect won't refire, so focus directly.
      const list = items();
      list[index === "first" ? 0 : list.length - 1]?.focus();
      return;
    }
    focusOnOpen.current = index;
    setOpen(true);
  }

  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    const list = items();
    list[focusOnOpen.current === "first" ? 0 : list.length - 1]?.focus();
    focusOnOpen.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function onButtonKey(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      return close(true);
    }
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAt("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt("last");
    }
  }

  function onMenuKey(event: KeyboardEvent) {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const focus = (index: number) => list[(index + list.length) % list.length]?.focus();
    if (event.key === "ArrowDown") focus(at + 1);
    else if (event.key === "ArrowUp") focus(at - 1);
    else if (event.key === "Home") focus(0);
    else if (event.key === "End") focus(list.length - 1);
    else if (event.key === "Escape") close(true);
    else if (event.key === "Tab") return close(false);
    else return;
    event.preventDefault();
  }

  async function logOut() {
    setSigningOut(true);
    setOpen(false);
    // Leave first: a protected page (profile) would otherwise react to the cleared session by
    // redirecting to login before this navigation lands.
    router.replace("/");
    await authClient.signOut();
    setSigningOut(false);
    router.refresh();
  }

  if (isPending) {
    return (
      <span data-pending aria-hidden className="btn-link">
        Login
      </span>
    );
  }

  if (!session) {
    return (
      <Link href="/login" className="btn-link">
        Login
      </Link>
    );
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onButtonKey}
        className="caps inline-flex cursor-pointer items-center gap-2 text-label font-medium text-heading"
      >
        Account
        <Chevron open={open} />
      </button>
      <div
        id={menuId}
        role="menu"
        aria-label="Account"
        onKeyDown={onMenuKey}
        className={`slip absolute right-0 top-[calc(100%+0.75rem)] z-30 w-56 py-1 ease-out ${
          open
            ? // Visible at once (so keyboard focus can land), then fade and drop in.
              "visible translate-y-0 opacity-100 transition-[opacity,transform] duration-150"
            : // Stay visible while fading out, then hide so items can't take focus.
              "invisible -translate-y-1 opacity-0 transition-[opacity,transform,visibility] duration-100"
        } motion-reduce:translate-y-0`}
      >
        <p className="truncate border-b border-dashed border-ink px-4 pt-2 pb-3 text-label text-muted">
          {session.user.email}
        </p>
        <Link
          href="/profile"
          role="menuitem"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="caps block px-4 py-2.5 text-label font-medium text-heading no-underline transition-colors duration-150 hover:bg-wash focus-visible:bg-wash focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-ink"
        >
          Profile
        </Link>
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          disabled={signingOut}
          onClick={() => void logOut()}
          className="caps block w-full cursor-pointer px-4 py-2.5 text-left text-label font-medium text-heading transition-colors duration-150 hover:bg-wash focus-visible:bg-wash focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-ink disabled:cursor-wait disabled:text-muted"
        >
          {signingOut ? "Logging out…" : "Logout"}
        </button>
      </div>
    </div>
  );
}
