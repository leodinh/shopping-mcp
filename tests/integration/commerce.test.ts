import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { syncConnection } from "@/server/sync/service";
import { searchProducts } from "@/server/catalog/repository";
import type { MerchantConnector, NormalizedProduct } from "@/server/connectors/contract";

test("PostgreSQL sync and search lifecycle", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required; run db:migrate first");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const merchantIds: string[] = [];
  let snapshot: NormalizedProduct[] = [{ externalId: "backpack", name: "Black backpack", description: "Minimalist travel bag",
    priceMinor: 8900, currency: "USD", inventory: 5, images: [], productUrl: "https://test.example/backpack" }];
  const connector: MerchantConnector = { type: "demo", async fetchCatalog() { return snapshot; } };
  try {
    for (let index = 0; index < 2; index++) {
      const merchant = await pool.query("INSERT INTO merchants(slug, name, website_url) VALUES ($1, 'Test Merchant', 'https://test.example') RETURNING id", [`test-${randomUUID()}`]);
      merchantIds.push(merchant.rows[0].id);
    }
    const connections = [];
    for (const merchantId of merchantIds) {
      const connection = await pool.query("INSERT INTO merchant_connections(merchant_id, connector_type, config) VALUES ($1, 'demo', '{}') RETURNING id", [merchantId]);
      connections.push(connection.rows[0].id as string);
    }
    await syncConnection(connections[0], pool, connector);
    await syncConnection(connections[1], pool, connector);
    const initial = await searchProducts({ q: "black backpack", merchantId: merchantIds[0], maxPrice: "100" }, pool);
    assert.equal(initial.total, 1);
    const stableId = initial.products[0].id;
    assert.equal((await searchProducts({ q: "black backpack" }, pool)).products.filter((product) => merchantIds.includes(product.merchant.id)).length, 2);
    snapshot = [{ ...snapshot[0], priceMinor: 9900, inventory: 0 }];
    await syncConnection(connections[0], pool, connector);
    const updated = await searchProducts({ merchantId: merchantIds[0] }, pool);
    assert.equal(updated.total, 1);
    assert.equal(updated.products[0].id, stableId);
    assert.equal(updated.products[0].priceMinor, 9900);
    assert.equal((await searchProducts({ merchantId: merchantIds[0], inStock: "true" }, pool)).total, 0);
    assert.equal((await searchProducts({ merchantId: merchantIds[0], maxPrice: "98.99" }, pool)).total, 0);
    assert.equal((await searchProducts({ merchantId: merchantIds[0], currency: "CAD" }, pool)).total, 0);
    assert.equal((await searchProducts({ merchantId: merchantIds[0], offset: 10 }, pool)).total, 1);
    await assert.rejects(syncConnection(connections[0], pool, { type: "demo", async fetchCatalog() { throw new Error("Upstream offline"); } }));
    assert.equal((await searchProducts({ merchantId: merchantIds[0] }, pool)).total, 1);
    const status = await pool.query("SELECT last_error FROM merchant_connections WHERE id = $1", [connections[0]]);
    assert.match(status.rows[0].last_error, /Upstream offline/);
    await assert.rejects(syncConnection(connections[0], pool, { type: "demo", async fetchCatalog() { return [snapshot[0], snapshot[0]]; } }));
    assert.equal((await searchProducts({ merchantId: merchantIds[0] }, pool)).total, 1);
    const locker = await pool.connect();
    try {
      await locker.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [connections[0]]);
      await assert.rejects(syncConnection(connections[0], pool, connector), /already syncing/);
    } finally {
      await locker.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [connections[0]]);
      locker.release();
    }
    const saved = snapshot;
    snapshot = [];
    await syncConnection(connections[0], pool, connector);
    assert.equal((await searchProducts({ merchantId: merchantIds[0] }, pool)).total, 0);
    assert.equal((await searchProducts({ merchantId: merchantIds[1] }, pool)).total, 1);
    snapshot = saved;
    await syncConnection(connections[0], pool, connector);
    assert.equal((await searchProducts({ merchantId: merchantIds[0] }, pool)).products[0].id, stableId);
  } finally {
    await pool.query("DELETE FROM merchants WHERE id = ANY($1::uuid[])", [merchantIds]);
    await pool.end();
  }
});
