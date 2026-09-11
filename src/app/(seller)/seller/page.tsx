import { cookies } from "next/headers";
import Link from "next/link";
import { listMerchants } from "@/server/merchants/repository";
import { StoreConnections } from "@/app/(seller)/_components/store-connection";

export const dynamic = "force-dynamic";

export default async function Home() {
  const slug = (await cookies()).get("demo-store")?.value ?? null;
  let merchant = null;
  try {
    if (slug) merchant = (await listMerchants(slug))[0] ?? null;
  } catch {
    return (
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
    );
  }
  return (
    <StoreConnections
      merchant={
        merchant
          ? { ...merchant, lastSyncedAt: merchant.lastSyncedAt?.toISOString() ?? null }
          : null
      }
    />
  );
}
