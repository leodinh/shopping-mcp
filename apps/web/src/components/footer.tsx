import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <nav aria-label="Footer" className="flex min-h-14 items-center justify-end gap-5 px-4 sm:px-8">
        <Link href="/privacy" className="text-label font-bold text-muted no-underline hover:text-heading">
          Privacy
        </Link>
        <a
          href="https://github.com/leodinh/shopping-mcp/issues"
          className="text-label font-bold text-muted no-underline hover:text-heading"
        >
          Contact
        </a>
      </nav>
    </footer>
  );
}
