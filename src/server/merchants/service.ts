import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { database, type Database } from "@/server/db/client";
import { merchantConnections, merchants } from "@/server/db/schema";

export async function ensureMerchantForShop(shop: string, db: Database = database()) {
  const [byShop] = await db
    .select({ id: merchantConnections.merchantId })
    .from(merchantConnections)
    .where(eq(merchantConnections.shopDomain, shop))
    .limit(1);
  if (byShop) return byShop.id;
  const [bySlug] = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.slug, shop)).limit(1);
  if (bySlug) return bySlug.id;
  const name = shop.slice(0, shop.indexOf("."));
  const [inserted] = await db
    .insert(merchants)
    .values({ slug: shop, name, websiteUrl: `https://${shop}` })
    .onConflictDoUpdate({ target: merchants.slug, set: { name: sql`excluded.name` } })
    .returning({ id: merchants.id });
  return inserted.id;
}
