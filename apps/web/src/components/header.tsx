import Link from "next/link";
import Image from "next/image";
import { AccountMenu } from "@/features/account/account-menu";

export function Header() {
  return (
    <header className="relative z-20 flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-ink px-5 sm:min-h-16 sm:px-8">
      <Link
        href="/"
        className="caps flex min-w-0 items-center gap-3 text-wordmark font-semibold text-heading no-underline"
      >
        <Image
          src="/logo.png"
          alt=""
          width={40}
          height={40}
          priority
          className="h-7 w-auto shrink-0 object-contain mix-blend-multiply grayscale sm:h-8"
        />
        <span className="truncate">Shopping with Agent</span>
      </Link>
      <nav aria-label="Primary" className="flex shrink-0 items-center gap-6 has-[[data-pending]]:invisible sm:gap-8">
        <Link href="/docs" className="btn-link">
          Docs
        </Link>
        <AccountMenu />
      </nav>
    </header>
  );
}
