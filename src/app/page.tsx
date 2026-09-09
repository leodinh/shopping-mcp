import { cookies } from "next/headers";
import { listMerchants } from "@/server/merchants/repository";
import { StoreConnections } from "@/app/_components/store-connection";

export const dynamic = "force-dynamic";

export default async function Home() {
  const slug = (await cookies()).get("demo-store")?.value;
  let merchant = null;
  try {
    if (slug) merchant = (await listMerchants(slug))[0] ?? null;
  } catch {
    return (
      <main className="seller-page">
        <header>
          <a href="/">SHOPPING MCP</a>
        </header>
        <section className="intro">
          <h1>Store status unavailable.</h1>
          <p>Check your database connection and try again.</p>
          <a href="/">Try again →</a>
        </section>
      </main>
    );
  }
  return (
    <main className="seller-page">
      <header>
        <a href="/">SHOPPING MCP</a>
        <span>Seller workspace</span>
      </header>
      <StoreConnections
        merchant={
          merchant
            ? { ...merchant, lastSyncedAt: merchant.lastSyncedAt?.toISOString() ?? null }
            : null
        }
      />
    </main>
  );
}
