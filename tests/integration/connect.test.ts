import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { connectDemoStore } from "@/server/merchants/service";
import { demoCatalog } from "@/server/demo/catalog";

test("connect-first onboarding persists status, retries safely, and rejects unknown stores", async (context) => {
  assert.ok(process.env.DATABASE_URL);
  const schema = `connect_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(await readFile(new URL("../../db/migrations/001_commerce.sql", import.meta.url), "utf8"));
    const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json(demoCatalog("northline")));
    const first = await connectDemoStore("northline", pool);
    assert.equal(first.imported, 4);
    const again = await connectDemoStore("northline", pool);
    assert.equal(first.connectionId, again.connectionId);
    assert.equal((await pool.query("SELECT count(*)::int AS total FROM products")).rows[0].total, 4);
    assert.equal((await pool.query("SELECT count(*)::int AS total FROM merchants")).rows[0].total, 1);
    const successful = (await pool.query("SELECT * FROM merchant_connections")).rows[0];
    assert.ok(successful.last_synced_at);
    fetchMock.mock.mockImplementation(async () => new Response(null, { status: 503 }));
    await assert.rejects(connectDemoStore("northline", pool));
    const failed = (await pool.query("SELECT * FROM merchant_connections")).rows[0];
    assert.match(failed.last_error, /503/);
    assert.equal(failed.last_synced_at.toISOString(), successful.last_synced_at.toISOString());
    assert.equal((await pool.query("SELECT count(*)::int AS total FROM products WHERE active")).rows[0].total, 4);
    fetchMock.mock.mockImplementation(async () => Response.json(demoCatalog("northline")));
    await connectDemoStore("northline", pool);
    assert.equal((await pool.query("SELECT last_error FROM merchant_connections")).rows[0].last_error, null);
    await assert.rejects(connectDemoStore("https://arbitrary.example", pool), /available demo stores/);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
