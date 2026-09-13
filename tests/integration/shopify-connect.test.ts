import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createSession } from "@/server/auth/session";
import { handleShopifyConnect } from "@/server/shopify/connect";
import { handleShopifyCallback } from "@/server/shopify/callback";
import { decryptCredentials } from "@/server/shopify/credentials";
import { getDashboardMerchant } from "@/server/merchants/repository";

process.env.SESSION_SECRET = "test-session-secret-32-characters-min";
process.env.SHOPIFY_API_KEY = "test-key";
process.env.SHOPIFY_API_SECRET = "test-secret";
process.env.SHOPIFY_SCOPES = "read_products";
process.env.SHOPIFY_REDIRECT_URI = "http://127.0.0.1:3000/api/connections/shopify/callback";

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

test("Shopify connect stores a one-time oauth attempt from a dashboard session", async () => {
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

function signedCallbackQuery(params: Record<string, string>) {
  const hmac = createHmac("sha256", "test-secret")
    .update(
      Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join("&"),
    )
    .digest("hex");
  return new URLSearchParams({ ...params, hmac }).toString();
}

test("Shopify callback verifies HMAC, consumes state, stores encrypted credentials, and redirects", async (context) => {
  assert.ok(process.env.DATABASE_URL);
  const schema = `shopify_callback_${randomUUID().replaceAll("-", "")}`;
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
    const started = await handleShopifyConnect(
      new Request("http://127.0.0.1:3000/api/shopify/connect", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ shop: "example-shop.myshopify.com" }),
      }),
      pool,
    );
    const state = new URL((await started.json()).authorizationUrl).searchParams.get("state")!;
    const binding = started.headers
      .getSetCookie()
      .find((value) => value.startsWith("oauth_binding="))!
      .split(";")[0];
    const cookies = `${cookie}; ${binding}`;
    const query = {
      shop: "example-shop.myshopify.com",
      code: "auth-code",
      state,
      timestamp: "1710000000",
    };

    const unsigned = await handleShopifyCallback(
      new Request(
        `http://127.0.0.1:3000/api/connections/shopify/callback?${new URLSearchParams(query)}`,
        { headers: { cookie: cookies } },
      ),
      pool,
    );
    assert.equal(unsigned.status, 403);

    context.mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        assert.equal(String(input), "https://example-shop.myshopify.com/admin/oauth/access_token");
        assert.equal(init?.method, "POST");
        assert.match(String(init?.body), /code=auth-code/);
        assert.match(String(init?.body), /expiring=1/);
        return Response.json({
          access_token: "shpat_test",
          scope: "read_products",
          expires_in: 3600,
          refresh_token: "shprt_test",
          refresh_token_expires_in: 7776000,
        });
      },
    );

    const created = await handleShopifyCallback(
      new Request(
        `http://127.0.0.1:3000/api/connections/shopify/callback?${signedCallbackQuery(query)}`,
        { headers: { cookie: cookies } },
      ),
      pool,
    );
    assert.equal(created.status, 200);
    assert.match(await created.text(), /\/seller/);
    assert.match(
      created.headers.getSetCookie().find((value) => value.startsWith("session=")) ?? "",
      /^session=[^;]+; HttpOnly; Path=\/; Max-Age=2592000; SameSite=Lax$/,
    );

    const attempt = await pool.query("SELECT consumed_at FROM oauth_attempts WHERE state = $1", [
      state,
    ]);
    assert.ok(attempt.rows[0].consumed_at);

    const connection = await pool.query(
      `SELECT id, merchant_id, connector_type, shop_domain, scopes, credentials_encrypted,
              token_expires_at, refresh_token_expires_at FROM merchant_connections WHERE merchant_id = $1`,
      [merchantId],
    );
    assert.equal(connection.rows[0].connector_type, "shopify");
    assert.equal(connection.rows[0].shop_domain, "example-shop.myshopify.com");
    assert.equal(connection.rows[0].scopes, "read_products");
    assert.deepEqual(decryptCredentials(connection.rows[0].credentials_encrypted), {
      accessToken: "shpat_test",
      refreshToken: "shprt_test",
    });
    assert.ok(new Date(connection.rows[0].token_expires_at).getTime() - Date.now() > 3500 * 1000);
    const scheduled = await pool.query("SELECT status FROM sync_runs WHERE connection_id = $1", [
      connection.rows[0].id,
    ]);
    assert.equal(scheduled.rows[0].status, "pending");

    const reused = await handleShopifyCallback(
      new Request(
        `http://127.0.0.1:3000/api/connections/shopify/callback?${signedCallbackQuery(query)}`,
        { headers: { cookie: cookies } },
      ),
      pool,
    );
    assert.equal(reused.status, 403);

    const otherCookie = await createSession(other.rows[0].id, pool);
    const otherStart = await handleShopifyConnect(
      new Request("http://127.0.0.1:3000/api/shopify/connect", {
        method: "POST",
        headers: { cookie: otherCookie, "content-type": "application/json" },
        body: JSON.stringify({ shop: "example-shop.myshopify.com" }),
      }),
      pool,
    );
    const otherState = new URL((await otherStart.json()).authorizationUrl).searchParams.get(
      "state",
    )!;
    const otherBinding = otherStart.headers
      .getSetCookie()
      .find((value) => value.startsWith("oauth_binding="))!
      .split(";")[0];
    const stolen = await handleShopifyCallback(
      new Request(
        `http://127.0.0.1:3000/api/connections/shopify/callback?${signedCallbackQuery({
          shop: "example-shop.myshopify.com",
          code: "other-code",
          state: otherState,
          timestamp: "1710000000",
        })}`,
        { headers: { cookie: `${otherCookie}; ${otherBinding}` } },
      ),
      pool,
    );
    assert.equal(stolen.status, 409);
    assert.equal(
      (
        await pool.query("SELECT merchant_id FROM merchant_connections WHERE shop_domain = $1", [
          "example-shop.myshopify.com",
        ])
      ).rows[0].merchant_id,
      merchantId,
    );
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});

test("Connect Shopify from the browser creates a dashboard session after callback", async (context) => {
  assert.ok(process.env.DATABASE_URL);
  const schema = `shopify_ui_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await applyMigrations(pool);

    const started = await handleShopifyConnect(
      new Request("http://127.0.0.1:3000/api/shopify/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shop: "ui-shop.myshopify.com" }),
      }),
      pool,
    );
    assert.equal(started.status, 200);
    const state = new URL((await started.json()).authorizationUrl).searchParams.get("state")!;
    const binding = started.headers
      .getSetCookie()
      .find((value) => value.startsWith("oauth_binding="))!
      .split(";")[0];

    context.mock.method(globalThis, "fetch", async () =>
      Response.json({ access_token: "shpat_ui", scope: "read_products" }),
    );

    const callback = await handleShopifyCallback(
      new Request(
        `http://127.0.0.1:3000/api/connections/shopify/callback?${signedCallbackQuery({
          shop: "ui-shop.myshopify.com",
          code: "ui-code",
          state,
          timestamp: "1710000000",
        })}`,
        { headers: { cookie: binding } },
      ),
      pool,
    );
    assert.equal(callback.status, 200);
    assert.match(await callback.text(), /\/seller/);
    const sessionCookie = callback.headers
      .getSetCookie()
      .find((value) => value.startsWith("session="));
    assert.match(
      sessionCookie ?? "",
      /^session=[^;]+; HttpOnly; Path=\/; Max-Age=2592000; SameSite=Lax$/,
    );

    const dashboard = await getDashboardMerchant(sessionCookie!.split(";")[0], pool);
    assert.equal(dashboard?.connectorType, "shopify");
    assert.equal(dashboard?.enabled, true);
    assert.equal(dashboard?.slug, "ui-shop.myshopify.com");
    assert.ok(dashboard?.connectionId);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});

test("Shopify callback rolls back all writes when token exchange fails", async (context) => {
  assert.ok(process.env.DATABASE_URL);
  const schema = `shopify_rollback_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await applyMigrations(pool);
    const started = await handleShopifyConnect(
      new Request("http://127.0.0.1:3000/api/shopify/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shop: "rollback-shop.myshopify.com" }),
      }),
      pool,
    );
    const state = new URL((await started.json()).authorizationUrl).searchParams.get("state")!;
    const binding = started.headers
      .getSetCookie()
      .find((value) => value.startsWith("oauth_binding="))!
      .split(";")[0];

    context.mock.method(globalThis, "fetch", async () => new Response("nope", { status: 500 }));

    const callback = await handleShopifyCallback(
      new Request(
        `http://127.0.0.1:3000/api/connections/shopify/callback?${signedCallbackQuery({
          shop: "rollback-shop.myshopify.com",
          code: "rollback-code",
          state,
          timestamp: "1710000000",
        })}`,
        { headers: { cookie: binding } },
      ),
      pool,
    );
    assert.equal(callback.status, 503);
    assert.equal(
      (await pool.query("SELECT consumed_at FROM oauth_attempts WHERE state = $1", [state])).rows[0]
        .consumed_at,
      null,
    );
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM merchant_connections")).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM sync_runs")).rows[0].n, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM sessions")).rows[0].n, 0);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
