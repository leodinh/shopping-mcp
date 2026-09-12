import type { Pool, PoolClient } from "pg";
import { database } from "@/server/db/client";
import { createSession, SESSION_COOKIE_MAX_AGE } from "@/server/auth/session";
import { normalizeShopDomain } from "./connect";
import { encryptCredentials } from "./credentials";
import { verifyShopifyHmac } from "./hmac";

type Queryable = Pool | PoolClient;

function oauthBinding(cookieHeader: string | null) {
  return cookieHeader?.match(/(?:^|;\s*)oauth_binding=([^;]+)/)?.[1] ?? "";
}

async function consumeAttempt(
  state: string,
  shop: string,
  browserBinding: string,
  pool: Queryable,
) {
  const result = await pool.query<{ merchant_id: string }>(
    `UPDATE oauth_attempts SET consumed_at = now()
     WHERE state = $1 AND shop = $2 AND browser_binding = $3
       AND consumed_at IS NULL AND expires_at > now()
     RETURNING merchant_id`,
    [state, shop, browserBinding],
  );
  console.log("consumeAttempt", result.rowCount, state, shop, browserBinding);
  if (!result.rowCount) throw new Error("Invalid state");
  return result.rows[0].merchant_id;
}

async function exchangeCode(shop: string, code: string) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: process.env.SHOPIFY_API_KEY ?? "",
      client_secret: process.env.SHOPIFY_API_SECRET ?? "",
      code,
      expiring: "1",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("Token exchange failed");
  const token = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
  };
  if (!token.access_token) throw new Error("Token exchange failed");
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    scope: token.scope,
    expires_in: token.expires_in,
    refresh_token_expires_in: token.refresh_token_expires_in,
  };
}

async function upsertConnection(
  merchantId: string,
  shop: string,
  token: Awaited<ReturnType<typeof exchangeCode>>,
  pool: Queryable,
) {
  const owner = await pool.query<{ merchant_id: string }>(
    "SELECT merchant_id FROM merchant_connections WHERE shop_domain = $1",
    [shop],
  );
  if (owner.rows[0] && owner.rows[0].merchant_id !== merchantId) {
    throw new Error("Shop already connected");
  }
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
  const refreshExpiresAt = token.refresh_token_expires_in
    ? new Date(Date.now() + token.refresh_token_expires_in * 1000)
    : null;
  const connection = await pool.query<{ id: string }>(
    `INSERT INTO merchant_connections (
       merchant_id, connector_type, config, shop_domain, credentials_encrypted, scopes,
       token_expires_at, refresh_token_expires_at, enabled
     ) VALUES ($1, 'shopify', $2::jsonb, $3, $4, $5, $6, $7, true)
     ON CONFLICT (merchant_id) DO UPDATE SET
       connector_type = 'shopify', 
       config = EXCLUDED.config,
       shop_domain = EXCLUDED.shop_domain,
       credentials_encrypted = EXCLUDED.credentials_encrypted,
       scopes = EXCLUDED.scopes,
       token_expires_at = EXCLUDED.token_expires_at,
       refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
       enabled = true,
       last_error = NULL
     RETURNING id`,
    [
      merchantId,
      JSON.stringify({ shop }),
      shop,
      encryptCredentials({
        accessToken: token.access_token,
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      }),
      token.scope ?? "",
      expiresAt,
      refreshExpiresAt,
    ],
  );
  return connection.rows[0].id;
}

export async function handleShopifyCallback(request: Request, pool: Pool = database()) {
  try {
    const url = new URL(request.url);
    verifyShopifyHmac(url.searchParams);
    const shop = normalizeShopDomain(url.searchParams.get("shop"));
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    console.log("handleShopifyCallback", state, code);
    if (!state || !code) throw new Error("Invalid state");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const merchantId = await consumeAttempt(
        state,
        shop,
        oauthBinding(request.headers.get("cookie")),
        client,
      );
      const owner = await client.query<{ merchant_id: string }>(
        "SELECT merchant_id FROM merchant_connections WHERE shop_domain = $1",
        [shop],
      );
      if (owner.rows[0] && owner.rows[0].merchant_id !== merchantId) {
        throw new Error("Shop already connected");
      }
      const connectionId = await upsertConnection(
        merchantId,
        shop,
        await exchangeCode(shop, code),
        client,
      );
      await client.query("INSERT INTO sync_runs (connection_id, status) VALUES ($1, 'pending')", [
        connectionId,
      ]);
      const sessionCookie = await createSession(merchantId, client);
      await client.query("COMMIT");
      return new Response(null, {
        status: 302,
        headers: {
          Location: new URL("/seller", request.url).toString(),
          "Set-Cookie": `${sessionCookie}; HttpOnly; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax`,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    if (message === "Invalid HMAC" || message === "Invalid state") {
      return Response.json({ error: message }, { status: 403 });
    }
    if (message === "Invalid shop domain")
      return Response.json({ error: message }, { status: 400 });
    if (message === "Unauthorized") return Response.json({ error: message }, { status: 401 });
    if (message === "Shop already connected")
      return Response.json({ error: message }, { status: 409 });
    console.error("Shopify callback failed", error);
    return Response.json({ error: "Shopify callback unavailable." }, { status: 503 });
  }
}
