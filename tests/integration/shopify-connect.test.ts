import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createSession } from "@/server/auth/session";
import { handleShopifyConnect } from "@/server/shopify/connect";

process.env.SESSION_SECRET = "test-session-secret-32-characters-min";
process.env.SHOPIFY_API_KEY = "test-key";
process.env.SHOPIFY_SCOPES = "read_products";
process.env.SHOPIFY_REDIRECT_URI = "http://127.0.0.1:3000/api/shopify/callback";

async function applyMigrations(pool: Pool) {
  for (const name of [
    "001_commerce.sql",
    "002_sessions.sql",
    "003_drop_sellers.sql",
    "004_oauth_attempts.sql",
  ]) {
    await pool.query(
      await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), "utf8"),
    );
  }
}

test("Shopify connect requires a dashboard session and stores a one-time oauth attempt", async () => {
  assert.ok(process.env.DATABASE_URL);
  const schema = `shopify_connect_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await applyMigrations(pool);
    const merchant = await pool.query<{ id: string }>(
      "INSERT INTO merchants (slug, name, website_url) VALUES ($1, 'Northline', 'https://northline.example') RETURNING id",
      [`shopify-${randomUUID()}`],
    );
    const other = await pool.query<{ id: string }>(
      "INSERT INTO merchants (slug, name, website_url) VALUES ($1, 'Fieldwork', 'https://fieldwork.example') RETURNING id",
      [`shopify-${randomUUID()}`],
    );
    const merchantId = merchant.rows[0].id;
    const cookie = await createSession(merchantId, pool);

    const unauthenticated = await handleShopifyConnect(
      new Request("http://127.0.0.1:3000/api/shopify/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shop: "example-shop.myshopify.com" }),
      }),
      pool,
    );
    assert.equal(unauthenticated.status, 401);

    const invalid = await handleShopifyConnect(
      new Request("http://127.0.0.1:3000/api/shopify/connect", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ shop: "example.com" }),
      }),
      pool,
    );
    assert.equal(invalid.status, 400);

    const created = await handleShopifyConnect(
      new Request("http://127.0.0.1:3000/api/shopify/connect", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          shop: "https://Example-Shop.myshopify.com/admin",
          sellerId: other.rows[0].id,
        }),
      }),
      pool,
    );
    assert.equal(created.status, 200);
    const payload = await created.json();
    const url = new URL(payload.authorizationUrl);
    assert.equal(
      url.origin + url.pathname,
      "https://example-shop.myshopify.com/admin/oauth/authorize",
    );
    const state = url.searchParams.get("state");
    assert.match(state ?? "", /^[0-9a-f]{32}$/);
    const binding = created.headers
      .getSetCookie()
      .find((value) => value.startsWith("oauth_binding="));
    assert.match(binding ?? "", /^oauth_binding=[0-9a-f]{32};/);
    const attempt = await pool.query(
      "SELECT merchant_id, shop, expires_at, consumed_at, browser_binding FROM oauth_attempts WHERE state = $1",
      [state],
    );
    assert.equal(attempt.rows[0].merchant_id, merchantId);
    assert.equal(attempt.rows[0].shop, "example-shop.myshopify.com");
    assert.equal(attempt.rows[0].consumed_at, null);
    assert.equal(
      attempt.rows[0].browser_binding,
      binding?.slice("oauth_binding=".length, 32 + "oauth_binding=".length),
    );
    const remainingMs = new Date(attempt.rows[0].expires_at).getTime() - Date.now();
    assert.ok(remainingMs > 8 * 60 * 1000 && remainingMs <= 10 * 60 * 1000);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
