import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto">
      <div className="hatch h-3 border-y border-heading" aria-hidden="true" />
      <nav
        aria-label="Footer"
        className="flex min-h-16 items-center justify-end gap-5 px-5 sm:px-12"
      >
        <Link
          href="/privacy"
          className="text-label font-medium text-muted no-underline hover:text-heading"
        >
          Privacy
        </Link>
        <a
          href="https://github.com/leodinh/shopping-mcp/issues"
          className="text-label font-medium text-muted no-underline hover:text-heading"
        >
          Contact
        </a>
      </nav>
    </footer>
  );
}
