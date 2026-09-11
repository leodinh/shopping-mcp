import { cookies } from "next/headers";
import Link from "next/link";
import { listMerchants } from "@/server/merchants/repository";
import { StoreConnections } from "@/app/_components/store-connection";

export const dynamic = "force-dynamic";

function SellerShell({ aside, children }: { aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-5 sm:px-12">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-line text-xs sm:min-h-20">
        <Link href="/" className="font-extrabold tracking-widest no-underline">
          SHOPPING MCP
        </Link>
        {aside}
      </header>
      {children}
    </main>
  );
}

export default async function Home() {
  const slug = null;
  let merchant = null;
  try {
    if (slug) merchant = (await listMerchants(slug))[0] ?? null;
  } catch {
    return (
      <SellerShell>
        <section className="py-9 sm:pt-14 sm:pb-9">
          <h1 className="my-6 text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
            Store status unavailable.
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            Check your database connection and try again.
          </p>
          <Link href="/" className="underline underline-offset-4">
            Try again →
          </Link>
        </section>
      </SellerShell>
    );
  }
  return (
    <SellerShell aside={<span className="text-muted">Seller workspace</span>}>
      <StoreConnections
        merchant={
          merchant
            ? { ...merchant, lastSyncedAt: merchant.lastSyncedAt?.toISOString() ?? null }
            : null
        }
      />
    </SellerShell>
  );
}
