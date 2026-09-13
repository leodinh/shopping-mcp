import { and, eq } from "drizzle-orm";
import { database, pool } from "@/server/db/client";
import { merchantConnections, merchants } from "@/server/db/schema";
import { syncConnection } from "@/server/sync/service";

async function main() {
  const db = database();
  const source = pool();
  try {
    const slug = process.argv[2];
    const connections = await db
      .select({ id: merchantConnections.id, slug: merchants.slug })
      .from(merchantConnections)
      .innerJoin(merchants, eq(merchants.id, merchantConnections.merchantId))
      .where(
        slug
          ? and(eq(merchantConnections.enabled, true), eq(merchants.slug, slug))
          : eq(merchantConnections.enabled, true),
      )
      .orderBy(merchants.slug);
    if (!connections.length) {
      throw new Error("No enabled connections found. Connect a Shopify store or check the merchant slug.");
    }
    for (const connection of connections) {
      try {
        console.log(connection.slug, await syncConnection(connection.id, source));
      } catch (error) {
        console.error(connection.slug, error);
        process.exitCode = 1;
      }
    }
  } finally {
    await source.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
