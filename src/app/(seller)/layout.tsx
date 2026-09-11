import Link from "next/link";

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-5 sm:px-12">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-line text-xs sm:min-h-20">
        <Link href="/" className="font-extrabold tracking-widest no-underline">
          SHOPPING MCP
        </Link>
        <span className="text-muted">Seller workspace</span>
      </header>
      {children}
    </main>
  );
}
