import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto">
      <nav aria-label="Footer" className="flex min-h-14 items-center justify-end gap-5 px-5 sm:px-8">
        <Link href="/privacy" className="text-label text-muted no-underline hover:text-heading">
          Privacy
        </Link>
        <a
          href="https://github.com/leodinh/shopping-mcp/issues"
          className="text-label text-muted no-underline hover:text-heading"
        >
          Contact
        </a>
      </nav>
    </footer>
  );
}
