import Link from "next/link";
import Image from "next/image";

export function Header() {
  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-heading px-5 sm:min-h-20 sm:px-12">
      <Link
        href="/"
        aria-label="Shopping with Agent"
        className="flex items-center gap-2.5 text-wordmark font-semibold text-heading no-underline sm:text-wordmark-lg"
      >
        <Image
          src="/logo.png"
          alt=""
          width={40}
          height={40}
          priority
          className="h-9 shrink-0 object-contain brightness-0 sm:h-10"
          style={{ width: "auto" }}
        />
      </Link>
      <nav aria-label="Primary" className="flex shrink-0 items-center gap-5 sm:gap-7">
        <Link
          href="/docs"
          className="text-label font-medium text-muted no-underline hover:text-heading"
        >
          Docs
        </Link>
      </nav>
    </header>
  );
}
