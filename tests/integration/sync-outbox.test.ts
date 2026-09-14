import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { databaseFrom } from "@/server/db/client";
import { merchantConnections, merchants, syncRuns } from "@/server/db/schema";
import type { MerchantConnector, NormalizedProduct } from "@/server/connectors/contract";
import { drainSyncRuns, enqueueSync } from "@/server/sync/outbox";

async function applyMigrations(pool: Pool) {
  const sql = await readFile(
    new URL("../../db/migrations/0000_nifty_tyger_tiger.sql", import.meta.url),
    "utf8",
  );
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) await pool.query(trimmed.replaceAll('"public".', ""));
  }
}

test("sync outbox enqueues once, drains pending, and reclaims stale running", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required; run db:migrate first");
  const schema = `sync_outbox_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
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
    await admin.query(`CREATE SCHEMA ${schema}`);
    await applyMigrations(pool);
    const db = databaseFrom(pool);

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
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
    await admin.end();
  }
});
