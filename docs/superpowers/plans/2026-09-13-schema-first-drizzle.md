# Schema-first Drizzle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `src/server/db/schema.ts` the source of truth, replace handwritten SQL/entities, and convert server queries to the Drizzle builder.

**Architecture:** Tables live in one Drizzle schema. `drizzle-kit generate` writes `db/migrations`. `scripts/migrate.ts` applies that SQL to an empty PostgreSQL database. Domain folders stay; they import tables from the schema. `sql` is allowed only for full-text operators and advisory locks. `syncConnection` checks out one Pool client for the lock lifetime, then runs Drizzle on that client.

**Tech Stack:** drizzle-orm 0.45, drizzle-kit 0.31, pg 8.23, PostgreSQL 17, Next.js 16, Node 22, tsx, node:test

**Spec:** `docs/superpowers/specs/2026-09-12-schema-first-drizzle-design.md`

## Global Constraints

- Keep `pg`; do not add `postgres`, Prisma, or `drizzle-kit push`
- Do not use global `casing: 'snake_case'`; every column sets its SQL name explicitly
- Apply the initial migration to an empty PostgreSQL database
- Do not change HTTP/MCP status codes or Shopify/sync semantics
- `MerchantStatus` and `CatalogProduct` stay as read models
- `sql` / `db.execute` only for `websearch_to_tsquery` / `@@` / `ts_rank` and advisory locks
- Node `>=22`; drizzle-orm `^0.45.2`; drizzle-kit `^0.31.10`

## Already in the tree

Do not recreate these if they already match the code in this plan:

- `src/server/db/schema.ts` (tables exist; Task 1 only adds row-type aliases if missing)
- `drizzle.config.ts`
- `scripts/migrate.ts` (already uses `drizzle-orm/node-postgres/migrator`)
- `db/migrations/0000_nifty_tyger_tiger.sql` plus `meta/_journal.json`
- `package.json` scripts `db:migrate` / `db:generate` and the drizzle dependencies

Delete these when Task 2 says so (they still exist):

- `src/server/catalog/product.entity.ts`
- `src/server/merchants/merchant.entity.ts`
- `src/server/merchants/merchant-connection.entity.ts`
- `src/server/auth/session.entity.ts`
- `src/server/shopify/oauth-attempt.entity.ts`
- `src/server/sync/sync-run.entity.ts`

---

### Task 1: Define the tables in schema.ts

**Files:**
- Modify: `src/server/db/schema.ts`
- Test: `npx tsc --noEmit`

**Interfaces:**
- Consumes: none
- Produces: `merchants`, `merchantConnections`, `products`, `sessions`, `oauthAttempts`, `syncRuns` plus row types `Merchant`, `MerchantConnection`, `Product`, `Session`, `OAuthAttempt`, `SyncRun`

- [ ] **Step 1: Confirm tables already match the spec**

Read `src/server/db/schema.ts`. It must already declare the six tables, generated `search_document`, GIN/partial indexes, shopify-only connector check, and FK `ON DELETE CASCADE`.

- [ ] **Step 2: Add row-type aliases at the bottom of `src/server/db/schema.ts`**

If these exports are missing, append:

```ts
export type Merchant = typeof merchants.$inferSelect;
export type MerchantConnection = typeof merchantConnections.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type OAuthAttempt = typeof oauthAttempts.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
```

Keep the existing `ConnectionConfig` export.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: PASS (entities still exist; this only adds aliases)

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "$(cat <<'EOF'
Export Drizzle row types from the schema.

EOF
)"
```

---

### Task 2: Remove old SQL migrations and handwritten entity types

**Files:**
- Delete: the six `*.entity.ts` files listed above
- Modify: `src/server/auth/session.ts`
- Modify: `src/server/shopify/connect.ts`
- Modify: `src/server/sync/service.ts`
- Test: `npm run typecheck`

**Interfaces:**
- Consumes: Task 1 row types
- Produces: no remaining imports of `*.entity.ts`

Old `001_*.sql` … `006_*.sql` files are already gone. Do not recreate them. Queries still use `pg` `pool.query` after this task.

- [ ] **Step 1: Retarget type imports**

In `src/server/auth/session.ts`, replace:

```ts
import type { Session } from "./session.entity";
```

with:

```ts
import type { Session } from "@/server/db/schema";
```

In `src/server/shopify/connect.ts`, replace:

```ts
import type { OAuthAttempt } from "./oauth-attempt.entity";
```

with:

```ts
import type { OAuthAttempt } from "@/server/db/schema";
```

In `src/server/sync/service.ts`, replace:

```ts
import type { MerchantConnection } from "@/server/merchants/merchant-connection.entity";
```

with:

```ts
import type { MerchantConnection } from "@/server/db/schema";
```

`Pick<Session, "id">` and `Pick<OAuthAttempt, "state">` stay valid. `MerchantConnection` now includes Shopify columns; the existing SELECT list still type-checks as a subset assigned into that type. If TypeScript complains about missing columns on the SELECT result, change the query generic to the picked fields actually selected:

```ts
const result = await client.query<Pick<MerchantConnection, "id" | "merchantId" | "connectorType" | "config" | "enabled" | "lastSyncedAt" | "lastAttemptAt" | "lastError" | "createdAt">>(...)
```

- [ ] **Step 2: Delete the entity files**

```bash
rm src/server/catalog/product.entity.ts \
  src/server/merchants/merchant.entity.ts \
  src/server/merchants/merchant-connection.entity.ts \
  src/server/auth/session.entity.ts \
  src/server/shopify/oauth-attempt.entity.ts \
  src/server/sync/sync-run.entity.ts
```

- [ ] **Step 3: Confirm no leftover imports**

Run: `rg "\\.entity" --glob '*.ts'`

Expected: no matches

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/session.ts src/server/shopify/connect.ts src/server/sync/service.ts
git add -u src/server
git commit -m "$(cat <<'EOF'
Delete handwritten table types in favor of the Drizzle schema.

EOF
)"
```

---

### Task 3: Generate a fresh initial migration

**Files:**
- Verify: `drizzle.config.ts`
- Verify: `db/migrations/0000_nifty_tyger_tiger.sql`
- Verify: `db/migrations/meta/_journal.json`
- Test: `npx drizzle-kit generate`

**Interfaces:**
- Consumes: `src/server/db/schema.ts`
- Produces: a single `0000_*.sql` plus snapshot; no second migration file

- [ ] **Step 1: Confirm drizzle.config.ts**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/shopping-mcp",
  },
});
```

- [ ] **Step 2: Generate**

Run: `npm run db:generate`

Expected: “No schema changes, nothing to migrate” (or equivalent). Do **not** keep a second SQL file if kit emits one because of a cosmetic diff. If it does emit one, inspect the SQL. Allowed fix: adjust `schema.ts` so it matches the existing `0000` snapshot (constraint names, generated column expression) and delete the extra file + extra journal entry. Forbidden: hand-editing generated SQL except to fix a drizzle-kit bug.

The existing `0000_nifty_tyger_tiger.sql` must create `merchants`, `merchant_connections`, `products` (with `search_document` and the three partial indexes), `sessions`, `oauth_attempts`, `sync_runs`, and FKs `ON DELETE cascade`.

- [ ] **Step 3: Commit only if schema.ts or the journal changed**

If generate was a no-op, skip the commit.

---

### Task 4: Apply the migration to an empty PostgreSQL database

**Files:**
- Modify: `tests/integration/shopify-connect.test.ts` (`applyMigrations`)
- Test: `npm run db:migrate` against empty DB; `npm run test:integration -- tests/integration/shopify-connect.test.ts` still uses raw `pool.query` in app code

**Interfaces:**
- Consumes: `db/migrations/0000_nifty_tyger_tiger.sql`
- Produces: empty local `shopping-mcp` database with drizzle tables; isolated-schema tests apply the same SQL

- [ ] **Step 1: Create an empty database and migrate**

```bash
dropdb --if-exists shopping-mcp
createdb shopping-mcp
npm run db:migrate
```

Expected: migrator applies `0000_nifty_tyger_tiger` and exits 0.

- [ ] **Step 2: Confirm tables**

```bash
psql "$DATABASE_URL" -c '\dt'
```

Expected: `merchants`, `merchant_connections`, `products`, `sessions`, `oauth_attempts`, `sync_runs`, and drizzle’s migrations table.

- [ ] **Step 3: Point isolated integration tests at the generated SQL**

Replace `applyMigrations` in `tests/integration/shopify-connect.test.ts` with:

```ts
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
```

`replaceAll('"public".', "")` is required: drizzle emits `REFERENCES "public"."merchants"`, which would miss tables created under the test `search_path`.

- [ ] **Step 4: Run Shopify integration tests**

Run: `npm run test:integration -- tests/integration/shopify-connect.test.ts`

Expected: PASS (app code still uses `pool.query`)

- [ ] **Step 5: Commit**

```bash
git add tests/integration/shopify-connect.test.ts
git commit -m "$(cat <<'EOF'
Load the Drizzle initial migration in isolated schema tests.

EOF
)"
```

---

### Task 5: Convert queries and mutations module by module

**Files:**
- Modify: `src/server/db/client.ts`
- Modify: every server module that currently calls `database()` / `pool.query`
- Modify: `scripts/sync.ts`
- Modify: `tests/integration/commerce.test.ts`
- Modify: `tests/integration/shopify-connect.test.ts` (pass drizzle instances where signatures change)
- Test: `npm test`, then the relevant integration file after each module

**Interfaces:**
- Consumes: `pool(): Pool`, `databaseFrom(client: Pool | PoolClient): Database`, `database(): Database`
- Produces: converted modules listed below

`Database` is `ReturnType<typeof databaseFrom>`. Helpers that run inside a transaction take that type (the transaction object is assignable).

#### 5.1 Database client

- [ ] **Step 1: Replace `src/server/db/client.ts`**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema";

const globalDatabase = globalThis as unknown as { commercePool?: Pool };

export function pool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Copy .env.example to .env.");
  globalDatabase.commercePool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
  });
  return globalDatabase.commercePool;
}

export function databaseFrom(client: Pool | PoolClient) {
  return drizzle({ client, schema });
}

export function database() {
  return databaseFrom(pool());
}

type DrizzleDb = ReturnType<typeof databaseFrom>;
export type Database = DrizzleDb | Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];
```

`Database` is the drizzle instance or a transaction, so `createSession(merchantId, tx)` type-checks.

- [ ] **Step 2: Point every current `database()` Pool caller at `pool()`**

Until a module is converted, it must import `pool` from `@/server/db/client` and keep `.query()`. Files:

- `src/server/auth/session.ts`
- `src/server/merchants/repository.ts`
- `src/server/merchants/service.ts`
- `src/server/shopify/connect.ts`
- `src/server/shopify/callback.ts`
- `src/server/catalog/repository.ts`
- `src/server/sync/service.ts`
- `scripts/sync.ts`

Change `import { database }` to `import { pool }` and `database()` to `pool()`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: PASS

#### 5.2 Auth

- [ ] **Step 4: Convert `src/server/auth/session.ts`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { database, type Database } from "@/server/db/client";
import { sessions } from "@/server/db/schema";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_MS / 1000;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required");
  return value;
}

export function signSessionCookie(sessionId: string, expiresAt = Date.now() + SESSION_TTL_MS) {
  const payload = `${sessionId}.${expiresAt}`;
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("hex")}`;
}

export function readSessionCookie(cookieHeader: string | null) {
  const value = cookieHeader?.match(/(?:^|;\s*)session=([^;]+)/)?.[1];
  const [sessionId, exp, sig] = value?.split(".") ?? [];
  const expected =
    sessionId && exp
      ? createHmac("sha256", secret()).update(`${sessionId}.${exp}`).digest("hex")
      : "";
  if (
    !sig ||
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ||
    Number(exp) < Date.now()
  ) {
    throw new Error("Unauthorized");
  }
  return sessionId;
}

export async function createSession(merchantId: string, db: Database = database()) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [inserted] = await db
    .insert(sessions)
    .values({ merchantId, expiresAt })
    .returning({ id: sessions.id });
  return `session=${signSessionCookie(inserted.id, expiresAt.getTime())}`;
}

export async function requireSession(cookieHeader: string | null, db: Database = database()) {
  const sessionId = readSessionCookie(cookieHeader);
  const [row] = await db
    .select({ merchantId: sessions.merchantId })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())));
  if (!row) throw new Error("Unauthorized");
  return row.merchantId;
}
```

- [ ] **Step 5: Update Shopify integration tests to pass drizzle into `createSession`**

In `tests/integration/shopify-connect.test.ts` add:

```ts
import { databaseFrom } from "@/server/db/client";
```

After constructing each isolated `pool`, set `const db = databaseFrom(pool);`. Change `createSession(merchantId, pool)` to `createSession(merchantId, db)`. Leave `handleShopifyConnect(..., pool)` until 5.4.

- [ ] **Step 6: Run unit session tests**

Run: `npm test`

Expected: PASS (`tests/shopify-connect.test.ts` uses cookie helpers only)

#### 5.3 Merchants

- [ ] **Step 7: Convert `src/server/merchants/service.ts`**

```ts
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
```

- [ ] **Step 8: Convert `src/server/merchants/repository.ts`**

```ts
import { and, count, eq, sql } from "drizzle-orm";
import { database, type Database } from "@/server/db/client";
import { requireSession } from "@/server/auth/session";
import { merchantConnections, merchants, products } from "@/server/db/schema";
import type { MerchantStatus } from "@/server/merchants/merchant-status";

const statusSelect = {
  id: merchants.id,
  slug: merchants.slug,
  name: merchants.name,
  connectionId: merchantConnections.id,
  connectorType: merchantConnections.connectorType,
  enabled: merchantConnections.enabled,
  lastSyncedAt: merchantConnections.lastSyncedAt,
  lastError: merchantConnections.lastError,
  productCount: sql<number>`cast(${count(products.id)} as int)`,
};

function statusQuery(db: Database) {
  return db
    .select(statusSelect)
    .from(merchants)
    .leftJoin(merchantConnections, eq(merchantConnections.merchantId, merchants.id))
    .leftJoin(products, and(eq(products.merchantId, merchants.id), eq(products.active, true)))
    .groupBy(merchants.id, merchantConnections.id);
}

export async function listMerchants(slug?: string, db: Database = database()) {
  const rows = await statusQuery(db)
    .where(slug === undefined ? undefined : eq(merchants.slug, slug))
    .orderBy(merchants.name);
  return rows as MerchantStatus[];
}

export async function getDashboardMerchant(cookieHeader: string | null, db: Database = database()) {
  let merchantId: string;
  try {
    merchantId = await requireSession(cookieHeader, db);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return null;
    throw error;
  }
  const rows = await statusQuery(db).where(eq(merchants.id, merchantId));
  return (rows[0] as MerchantStatus | undefined) ?? null;
}
```

`connectorType` is `string | null` from the left join; `MerchantStatus` wants `"shopify" | null`. Keep the `as MerchantStatus[]` cast.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`

Expected: PASS

#### 5.4 Shopify

- [ ] **Step 10: Convert `src/server/shopify/connect.ts`**

```ts
import { randomBytes } from "node:crypto";
import { database, type Database } from "@/server/db/client";
import { requireSession } from "@/server/auth/session";
import { ensureMerchantForShop } from "@/server/merchants/service";
import { oauthAttempts } from "@/server/db/schema";

const SHOP_DOMAIN = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
const ATTEMPT_TTL_MS = 10 * 60 * 1000;

export function normalizeShopDomain(input: unknown) {
  if (typeof input !== "string" || !input.trim()) throw new Error("Invalid shop domain");
  let hostname: string;
  try {
    const trimmed = input.trim().toLowerCase();
    hostname = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    throw new Error("Invalid shop domain");
  }
  if (!SHOP_DOMAIN.test(hostname)) throw new Error("Invalid shop domain");
  return hostname;
}

export function shopifyAuthorizeUrl(shop: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY ?? "",
    scope: process.env.SHOPIFY_SCOPES ?? "read_products",
    redirect_uri: process.env.SHOPIFY_REDIRECT_URI ?? "",
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params}`;
}

export async function startShopifyConnect(
  shop: unknown,
  merchantId: string,
  browserBinding: string,
  db: Database = database(),
) {
  const normalized = normalizeShopDomain(shop);
  const state = randomBytes(16).toString("hex");
  await db.insert(oauthAttempts).values({
    state,
    merchantId,
    shop: normalized,
    browserBinding,
    expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
  });
  return { authorizationUrl: shopifyAuthorizeUrl(normalized, state) };
}

function hasSessionCookie(cookieHeader: string | null) {
  return /(?:^|;\s*)session=/.test(cookieHeader ?? "");
}

export async function handleShopifyConnect(request: Request, db: Database = database()) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const body = (await request.json().catch(() => ({}))) as { shop?: unknown };
    const shop = normalizeShopDomain(body.shop);
    const merchantId = hasSessionCookie(cookieHeader)
      ? await requireSession(cookieHeader, db)
      : await ensureMerchantForShop(shop, db);
    const browserBinding = randomBytes(16).toString("hex");
    const response = Response.json(
      await startShopifyConnect(shop, merchantId, browserBinding, db),
    );
    response.headers.append(
      "set-cookie",
      `oauth_binding=${browserBinding}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`,
    );
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    if (message === "Unauthorized") return Response.json({ error: message }, { status: 401 });
    if (message === "Invalid shop domain")
      return Response.json({ error: message }, { status: 400 });
    console.error("Shopify connect failed", error);
    return Response.json({ error: "Shopify connect unavailable." }, { status: 503 });
  }
}
```

- [ ] **Step 11: Convert `src/server/shopify/callback.ts`**

Use `db.transaction` on the passed drizzle instance. Do not call `pool()`. Isolated tests wrap their schema pool with `databaseFrom(pool)`.

```ts
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { database, type Database } from "@/server/db/client";
import { createSession, SESSION_COOKIE_MAX_AGE } from "@/server/auth/session";
import { merchantConnections, oauthAttempts, syncRuns } from "@/server/db/schema";
import { normalizeShopDomain } from "./connect";
import { encryptCredentials } from "./credentials";
import { verifyShopifyHmac } from "./hmac";

function oauthBinding(cookieHeader: string | null) {
  return cookieHeader?.match(/(?:^|;\s*)oauth_binding=([^;]+)/)?.[1] ?? "";
}

async function consumeAttempt(state: string, shop: string, browserBinding: string, db: Database) {
  const [row] = await db
    .update(oauthAttempts)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(oauthAttempts.state, state),
        eq(oauthAttempts.shop, shop),
        eq(oauthAttempts.browserBinding, browserBinding),
        isNull(oauthAttempts.consumedAt),
        gt(oauthAttempts.expiresAt, new Date()),
      ),
    )
    .returning({ merchantId: oauthAttempts.merchantId });
  if (!row) throw new Error("Invalid state");
  return row.merchantId;
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
  db: Database,
) {
  const [owner] = await db
    .select({ merchantId: merchantConnections.merchantId })
    .from(merchantConnections)
    .where(eq(merchantConnections.shopDomain, shop))
    .limit(1);
  if (owner && owner.merchantId !== merchantId) throw new Error("Shop already connected");
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
  const refreshExpiresAt = token.refresh_token_expires_in
    ? new Date(Date.now() + token.refresh_token_expires_in * 1000)
    : null;
  const [connection] = await db
    .insert(merchantConnections)
    .values({
      merchantId,
      connectorType: "shopify",
      config: { shop },
      shopDomain: shop,
      credentialsEncrypted: encryptCredentials({
        accessToken: token.access_token,
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      }),
      scopes: token.scope ?? "",
      tokenExpiresAt: expiresAt,
      refreshTokenExpiresAt: refreshExpiresAt,
      enabled: true,
    })
    .onConflictDoUpdate({
      target: merchantConnections.merchantId,
      set: {
        connectorType: "shopify",
        config: sql`excluded.config`,
        shopDomain: sql`excluded.shop_domain`,
        credentialsEncrypted: sql`excluded.credentials_encrypted`,
        scopes: sql`excluded.scopes`,
        tokenExpiresAt: sql`excluded.token_expires_at`,
        refreshTokenExpiresAt: sql`excluded.refresh_token_expires_at`,
        enabled: true,
        lastError: null,
      },
    })
    .returning({ id: merchantConnections.id });
  return connection.id;
}

export async function handleShopifyCallback(request: Request, db: Database = database()) {
  try {
    const url = new URL(request.url);
    verifyShopifyHmac(url.searchParams);
    const shop = normalizeShopDomain(url.searchParams.get("shop"));
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (!state || !code) throw new Error("Invalid state");
    let sessionCookie = "";
    await db.transaction(async (tx) => {
      const merchantId = await consumeAttempt(
        state,
        shop,
        oauthBinding(request.headers.get("cookie")),
        tx,
      );
      const [owner] = await tx
        .select({ merchantId: merchantConnections.merchantId })
        .from(merchantConnections)
        .where(eq(merchantConnections.shopDomain, shop))
        .limit(1);
      if (owner && owner.merchantId !== merchantId) throw new Error("Shop already connected");
      const connectionId = await upsertConnection(
        merchantId,
        shop,
        await exchangeCode(shop, code),
        tx,
      );
      await tx.insert(syncRuns).values({ connectionId, status: "pending" });
      sessionCookie = await createSession(merchantId, tx);
    });
    return new Response(
      `<!doctype html><meta http-equiv="refresh" content="0;url=/seller"><script>location.replace("/seller")</script><a href="/seller">Continue</a>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Set-Cookie": `${sessionCookie}; HttpOnly; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax`,
        },
      },
    );
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
```

- [ ] **Step 12: Update Shopify integration tests to pass `databaseFrom(pool)`**

Every `handleShopifyConnect(request, pool)` → `handleShopifyConnect(request, db)`.

Every `handleShopifyCallback(request, pool)` → `handleShopifyCallback(request, db)`.

Every `getDashboardMerchant(cookie, pool)` → `getDashboardMerchant(cookie, db)`.

Fixture `pool.query` inserts/selects in the test file may stay as raw SQL.

- [ ] **Step 13: Run Shopify integration tests**

Run: `npm run test:integration -- tests/integration/shopify-connect.test.ts`

Expected: PASS

#### 5.5 Catalog

- [ ] **Step 14: Convert `src/server/catalog/repository.ts`**

```ts
import { z } from "zod";
import { and, desc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { minorUnits, searchSchema, type CatalogProduct } from "@/shared/catalog-schema";
import { database, type Database } from "@/server/db/client";
import { merchants, products } from "@/server/db/schema";

const productIdSchema = z.uuid().transform((id) => id.toLowerCase());
const productIdsSchema = z.array(productIdSchema).min(2).max(5).refine(
  (ids) => new Set(ids).size === ids.length,
  "Product IDs must be unique",
);

const productSelect = {
  id: products.id,
  externalId: products.externalId,
  name: products.name,
  description: products.description,
  priceMinor: products.priceMinor,
  currency: products.currency,
  images: products.images,
  inventory: products.inventory,
  productUrl: products.productUrl,
  updatedAt: products.updatedAt,
  merchant: {
    id: merchants.id,
    name: merchants.name,
    slug: merchants.slug,
  },
};

function catalogWhere(filters: ReturnType<typeof searchSchema.parse>) {
  const tsquery = sql`websearch_to_tsquery('english', ${filters.q})`;
  return and(
    eq(products.active, true),
    or(eq(sql`${filters.q}`, sql`''`), sql`${products.searchDocument} @@ ${tsquery}`),
    filters.merchantId ? eq(products.merchantId, filters.merchantId) : undefined,
    eq(products.currency, filters.currency),
    filters.maxPrice === undefined ? undefined : lte(products.priceMinor, minorUnits(filters.maxPrice)),
    filters.inStock === "true" ? gt(products.inventory, 0) : undefined,
  );
}

export async function searchProducts(input: unknown, db: Database = database()) {
  const filters = searchSchema.parse(input);
  const tsquery = sql`websearch_to_tsquery('english', ${filters.q})`;
  const where = catalogWhere(filters);
  return db.transaction(
    async (tx) => {
      const [countRow] = await tx
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(products)
        .where(where);
      const rows = await tx
        .select(productSelect)
        .from(products)
        .innerJoin(merchants, eq(products.merchantId, merchants.id))
        .where(where)
        .orderBy(desc(sql`ts_rank(${products.searchDocument}, ${tsquery})`), products.name, products.id)
        .limit(filters.limit)
        .offset(filters.offset);
      return {
        products: rows as CatalogProduct[],
        total: countRow.total,
        limit: filters.limit,
        offset: filters.offset,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getProductById(id: string, db: Database = database()) {
  const productId = productIdSchema.parse(id);
  const [row] = await db
    .select(productSelect)
    .from(products)
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(and(eq(products.active, true), eq(products.id, productId)));
  return (row as CatalogProduct | undefined) ?? null;
}

export async function compareProducts(ids: string[], db: Database = database()) {
  const productIds = productIdsSchema.parse(ids);
  const rows = await db
    .select(productSelect)
    .from(products)
    .innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(and(eq(products.active, true), inArray(products.id, productIds)));
  const byId = new Map((rows as CatalogProduct[]).map((product) => [product.id, product]));
  return {
    products: productIds.flatMap((productId) => {
      const product = byId.get(productId);
      return product ? [product] : [];
    }),
    missingIds: productIds.filter((productId) => !byId.has(productId)),
  };
}

export async function getCheckout(id: string, db: Database = database()) {
  const product = await getProductById(id, db);
  if (!product) return null;
  return {
    supported: false as const,
    productId: product.id,
    merchant: product.merchant,
    checkoutUrl: null,
    productUrl: product.productUrl,
    message: "Merchant checkout is not integrated yet. Use the product URL until a real checkout exists.",
  };
}
```

If `eq(sql`${filters.q}`, sql`''`)` is awkward, use `filters.q === "" ? sql`true` : sql`${products.searchDocument} @@ ${tsquery}` ` inside `and(...)`.

If `accessMode: "read only"` is not in drizzle 0.45’s transaction config type, drop `accessMode` and keep `isolationLevel: "repeatable read"`.

- [ ] **Step 15: Run contract tests**

Run: `npm test`

Expected: PASS (catalog unit tests mock nothing; they only validate Zod/connectors)

#### 5.6 Sync

- [ ] **Step 16: Convert `src/server/sync/service.ts`**

Advisory lock must stay on one checked-out client. Accept `Pool`, wrap that client with Drizzle:

```ts
import { and, eq, not, inArray, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { databaseFrom, pool } from "@/server/db/client";
import { type MerchantConnector, validateSnapshot } from "@/server/connectors/contract";
import { getConnector } from "@/server/connectors/registry";
import { merchantConnections, products } from "@/server/db/schema";

export async function syncConnection(
  connectionId: string,
  source: Pool = pool(),
  connectorOverride?: MerchantConnector,
) {
  const client = await source.connect();
  const db = databaseFrom(client);
  let locked = false;
  try {
    const lock = await db.execute<{ acquired: boolean }>(
      sql`SELECT pg_try_advisory_lock(hashtextextended(${connectionId}, 0)) AS acquired`,
    );
    locked = Boolean(lock.rows[0]?.acquired);
    if (!locked) throw new Error("This connection is already syncing");
    const [connection] = await db
      .select()
      .from(merchantConnections)
      .where(eq(merchantConnections.id, connectionId));
    if (!connection) throw new Error("Merchant connection not found");
    if (!connection.enabled) throw new Error("Merchant connection is disabled");
    await db
      .update(merchantConnections)
      .set({ lastAttemptAt: sql`now()` })
      .where(eq(merchantConnections.id, connectionId));
    const catalog = validateSnapshot(await (connectorOverride ?? getConnector(connection.connectorType)).fetchCatalog(connection.config));
    return await db.transaction(async (tx) => {
      for (const product of catalog) {
        await tx
          .insert(products)
          .values({
            merchantId: connection.merchantId,
            externalId: product.externalId,
            name: product.name,
            description: product.description,
            priceMinor: product.priceMinor,
            currency: product.currency,
            images: product.images,
            inventory: product.inventory,
            productUrl: product.productUrl,
          })
          .onConflictDoUpdate({
            target: [products.merchantId, products.externalId],
            set: {
              name: sql`excluded.name`,
              description: sql`excluded.description`,
              priceMinor: sql`excluded.price_minor`,
              currency: sql`excluded.currency`,
              images: sql`excluded.images`,
              inventory: sql`excluded.inventory`,
              productUrl: sql`excluded.product_url`,
              active: true,
              updatedAt: sql`now()`,
            },
          });
      }
      const removed = await tx
        .update(products)
        .set({ active: false, updatedAt: sql`now()` })
        .where(
          and(
            eq(products.merchantId, connection.merchantId),
            eq(products.active, true),
            catalog.length
              ? not(inArray(products.externalId, catalog.map((product) => product.externalId)))
              : sql`true`,
          ),
        );
      await tx
        .update(merchantConnections)
        .set({ lastSyncedAt: sql`now()`, lastError: null })
        .where(eq(merchantConnections.id, connectionId));
      return { connectionId, imported: catalog.length, deactivated: removed.rowCount ?? 0 };
    });
  } catch (error) {
    if (locked) {
      await db
        .update(merchantConnections)
        .set({ lastError: (error instanceof Error ? error.message : "Sync failed").slice(0, 2000) })
        .where(eq(merchantConnections.id, connectionId));
    }
    throw error;
  } finally {
    try {
      if (locked) {
        await db.execute(sql`SELECT pg_advisory_unlock(hashtextextended(${connectionId}, 0))`);
      }
      client.release();
    } catch (error) {
      client.release(true);
      throw error;
    }
  }
}
```

Empty-snapshot deactivation: `NOT (external_id = ANY($2::text[]))` with an empty array is true for every row in PostgreSQL (`= ANY('{}')` is false, so `NOT` is true). Preserve that with `catalog.length ? not(inArray(...)) : sql`true``.

If `db.execute` in drizzle 0.45 returns rows at the top level rather than `{ rows }`, read `acquired` from that shape. If `update().where()` has no `rowCount`, use `returning({ id: products.id })` and `deactivated: removed.length`.

On failure, today’s code ROLLBACKs the product writes then records `last_error` outside the transaction. `db.transaction` already rolls back. The `catch` update of `last_error` must run on the same client **after** the failed transaction, which the code above does.

- [ ] **Step 17: Convert `scripts/sync.ts`**

```ts
import { eq, sql } from "drizzle-orm";
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
          ? sql`${merchantConnections.enabled} AND ${merchants.slug} = ${slug}`
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
```

Prefer `and(eq(merchantConnections.enabled, true), eq(merchants.slug, slug))` when `slug` is set, instead of the `sql` fragment above.

- [ ] **Step 18: Convert commerce integration fixtures to drizzle and pass `databaseFrom(pool)` into catalog**

In `tests/integration/commerce.test.ts`:

```ts
import { eq, inArray } from "drizzle-orm";
import { databaseFrom } from "@/server/db/client";
import { merchantConnections, merchants } from "@/server/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = databaseFrom(pool);
// inserts:
const [merchant] = await db.insert(merchants).values({
  slug: `test-${randomUUID()}`,
  name: "Test Merchant",
  websiteUrl: "https://test.example",
}).returning({ id: merchants.id });
const [connection] = await db.insert(merchantConnections).values({
  merchantId: merchant.id,
  connectorType: "shopify",
  config: {},
}).returning({ id: merchantConnections.id });
// search/compare/checkout: pass db
await searchProducts({ q: "black backpack", merchantId: merchantIds[0], maxPrice: "100" }, db);
await getProductById(stableId, db);
await compareProducts([pair[0].id, pair[1].id], db);
await getCheckout(stableId, db);
await syncConnection(connections[0], pool, connector);
// last_error assertion:
const [status] = await db
  .select({ lastError: merchantConnections.lastError })
  .from(merchantConnections)
  .where(eq(merchantConnections.id, connections[0]));
assert.match(status.lastError ?? "", /Upstream offline/);
// cleanup:
await db.delete(merchants).where(inArray(merchants.id, merchantIds));
```

Keep the advisory-lock probe on a raw `pool.connect()` client (`pg_advisory_lock` / unlock). `syncConnection` still takes that same `pool`.

- [ ] **Step 19: Run commerce integration tests**

Run: `npm run test:integration -- tests/integration/commerce.test.ts`

Expected: PASS, including empty snapshot deactivating products, failed fetch leaving the previous catalog intact, and “already syncing”

- [ ] **Step 20: Commit**

```bash
git add src/server scripts/sync.ts tests/integration
git commit -m "$(cat <<'EOF'
Convert server queries to the Drizzle query builder.

EOF
)"
```

---

### Task 6: Run tests, typechecking, and a production build

**Files:**
- Modify: `README.md` architecture bullets that still name `*.entity.ts`
- Test: `npm test`, `npm run typecheck`, `npm run test:integration`, `npm run build`

**Interfaces:**
- Consumes: Tasks 1–5
- Produces: docs that match the schema-first layout

- [ ] **Step 1: Update README architecture**

Replace the catalog/merchants/db/migrations bullets and the data-model sentence that names entity files:

```text
- `src/server/catalog`: validated search, PostgreSQL full-text search and pagination.
- `src/server/merchants`: merchant services and the `MerchantStatus` read model.
- `src/server/db/schema.ts`: Drizzle table definitions (source of truth for columns and types).
- `src/server/db/client.ts`: pooled `pg` connection wrapped with Drizzle, shared across development reloads.
- `db/migrations`: drizzle-kit SQL and snapshots.
```

```text
`Merchant 1 — 1 MerchantConnection`, `Merchant 1 — N Product`. Table shapes are declared in `src/server/db/schema.ts`. `MerchantStatus` and `CatalogProduct` are read models, not table rows.
```

- [ ] **Step 2: Confirm no leftover Pool-as-database usage in server modules**

Run: `rg "from \"./.*entity|pool\\.query|database\\(\\): Pool" src/server`

Expected: no entity imports; no `pool.query` in converted modules. `syncConnection` may still mention `Pool`. `client.ts` still uses `Pool`.

- [ ] **Step 3: Run the full gate**

```bash
npm test
npm run typecheck
npm run test:integration
npm run build
```

Expected: all PASS. Search, sync, connect, and callback behavior match today’s tests. `next build` completes.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
Document the Drizzle schema as the table source of truth.

EOF
)"
```
