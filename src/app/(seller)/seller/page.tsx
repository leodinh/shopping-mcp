import { cookies } from "next/headers";
import Link from "next/link";
import { getDashboardMerchant } from "@/server/merchants/repository";
import { StoreConnections } from "@/app/(seller)/_components/store-connection";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Store owners · Shopping with Agent",
};

export default async function Agent() {
  let merchant = null;
  try {
    merchant = await getDashboardMerchant(
      (await cookies())
        .getAll()
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ") || null,
    );
  } catch {
    return (
      <section className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-5 py-10 sm:px-8">
        <h1 className="text-headline font-bold text-heading">Store status unavailable.</h1>
        <p className="mt-4 text-intro text-muted">The dashboard could not reach the database.</p>
        <Link href="/seller" className="mt-6 inline-block font-bold text-heading underline decoration-primary underline-offset-4">
          Try again
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
