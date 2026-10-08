import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-ink">
      <nav
        aria-label="Footer"
        className="flex min-h-12 items-center justify-end gap-6 px-5 sm:px-8"
      >
        <Link href="/privacy" className="btn-link text-muted hover:text-heading">
          Privacy
        </Link>
        <a
          href="https://github.com/leodinh/shopping-mcp/issues"
          className="btn-link text-muted hover:text-heading"
        >
          Contact
        </a>
      </nav>
    </footer>
  );
}
