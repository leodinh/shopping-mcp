import Link from "next/link";
import Image from "next/image";

export function Header() {
  return (
    <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4 sm:min-h-16 sm:px-8">
      <Link
        href="/"
        className="flex min-w-0 items-center gap-2 text-sm font-bold text-heading no-underline sm:gap-2.5 sm:text-wordmark-lg"
      >
        <Image
          src="/logo.png"
          alt=""
          width={40}
          height={40}
          priority
          className="h-7 w-auto shrink-0 object-contain sm:h-9"
        />
        <span className="truncate">Shopping with Agent</span>
      </Link>
      <nav aria-label="Primary" className="flex shrink-0 items-center gap-3 sm:gap-5">
        <Link href="/docs" className="text-label font-bold text-muted no-underline hover:text-heading">
          Docs
        </Link>
        <Link href="/seller" className="text-label font-bold text-muted no-underline hover:text-heading">
          <span className="sm:hidden">Stores</span>
          <span className="hidden sm:inline">Store owners</span>
        </Link>
      </nav>
    </header>
  );
}
