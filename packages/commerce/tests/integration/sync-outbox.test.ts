import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drainSyncRuns, enqueueSync } from "@shopping-mcp/commerce/sync";
import type { MerchantConnector, NormalizedProduct } from "@shopping-mcp/commerce/connectors";
import { merchantConnections, merchants, syncRuns } from "@shopping-mcp/database";
import { createTestDatabase } from "@shopping-mcp/database/testing";

test("sync outbox enqueues once, drains pending, and reclaims stale running", async () => {
  const { pool, db, drop } = await createTestDatabase("sync_outbox");
  const snapshot: NormalizedProduct[] = [
    {
      externalId: "mug",
      name: "Stone mug",
      description: "Ceramic",
      priceMinor: 1200,
      currency: "USD",
      inventory: 3,
      images: [],
      productUrl: "https://test.example/mug",
    },
  ];
  const connector: MerchantConnector = {
    type: "shopify",
    async fetchCatalog() {
      return snapshot;
    },
  };
  try {
    const [merchant] = await db
      .insert(merchants)
      .values({
        slug: `outbox-${randomUUID()}`,
        name: "Outbox Merchant",
        websiteUrl: "https://outbox.example",
      })
      .returning({ id: merchants.id });
    const [connection] = await db
      .insert(merchantConnections)
      .values({
        merchantId: merchant.id,
        connectorType: "shopify",
        config: {},
        enabled: true,
      })
      .returning({ id: merchantConnections.id });

    const first = await enqueueSync(connection.id, db);
    assert.equal(first.status, "pending");
    const second = await enqueueSync(connection.id, db);
    assert.equal(second.id, first.id);

    const drained = await drainSyncRuns({ limit: 1, pool, connectorOverride: connector });
    assert.equal(drained.length, 1);
    assert.equal(drained[0].status, "succeeded");
    assert.equal(drained[0].productCount, 1);

    const [done] = await db.select().from(syncRuns).where(eq(syncRuns.id, first.id));
    assert.equal(done.status, "succeeded");
    assert.equal(done.productCount, 1);
    assert.ok(done.finishedAt);

    const stale = await enqueueSync(connection.id, db);
    await db
      .update(syncRuns)
      .set({
        status: "running",
        startedAt: new Date(Date.now() - 11 * 60 * 1000),
      })
      .where(eq(syncRuns.id, stale.id));

    const reclaimed = await drainSyncRuns({
      limit: 1,
      pool,
      connectorOverride: connector,
      staleAfterMs: 10 * 60 * 1000,
    });
    assert.equal(reclaimed.length, 1);
    assert.equal(reclaimed[0].id, stale.id);
    assert.equal(reclaimed[0].status, "succeeded");
  } finally {
    await drop();
  }
});
